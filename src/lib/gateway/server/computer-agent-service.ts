import { createHash } from 'node:crypto';
import { runComputerAgent, type ComputerAgentResult } from '../../harness/computer-agent';
import type { IConnectionStore, ISecretStore } from '../contracts/adapters';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import { createComputerDecisionMaker } from '../providers/computer-inference';
import { createOrgoComputer } from '../providers/orgo-computer';
import { requireGatewayOwner } from './access';
import type { GatewayCapacity } from './capacity';
import type { GatewayDatabase } from './storage/database';
import type { GatewayUsageService } from './usage-service';

const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const RUN_TIMEOUT_MS = 50_000;
const LOCK_TTL_MS = 65_000;

function readInput(raw: unknown, ctx: RequestContext) {
  const invalidInput = () => new GatewayError({
    code: 'invalid_request', message: 'Provide a UUID runId, a task, a connectionId, and a modelId.', requestId: ctx.requestId,
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalidInput();
  const { runId, task, connectionId, modelId } = raw as Record<string, unknown>;
  if (Object.keys(raw).length !== 4 || typeof runId !== 'string' || !ID.test(runId) ||
      typeof task !== 'string' || !task.trim() || task.length > 4_000 ||
      typeof connectionId !== 'string' || !connectionId.trim() || connectionId.length > 256 ||
      typeof modelId !== 'string' || !modelId.trim() || modelId.length > 256) throw invalidInput();
  return { runId: runId.toLowerCase(), task: task.trim(), connectionId, modelId };
}

export class GatewayComputerAgentService {
  constructor(private readonly services: {
    db: GatewayDatabase;
    connections: Pick<IConnectionStore, 'getConnection'>;
    secrets: Pick<ISecretStore, 'getSecret'>;
    usage: Pick<GatewayUsageService, 'reserveAttempt' | 'settleAttempt'>;
    capacity: Pick<GatewayCapacity, 'acquire'>;
    computerFactory?: typeof createOrgoComputer;
  }) {}

  async run(raw: unknown, ctx: RequestContext, requestSignal: AbortSignal): Promise<ComputerAgentResult & { runId: string }> {
    requireGatewayOwner(ctx);
    const computerId = process.env.GATEWAY_ORGO_COMPUTER_ID;
    const workspaceId = process.env.GATEWAY_ORGO_WORKSPACE_ID;
    const actorId = process.env.GATEWAY_ORGO_ACTOR_ID;
    const apiKey = process.env.ORGO_API_KEY?.trim();
    const failure = (code: GatewayError['code'], message: string) => new GatewayError({ code, message, requestId: ctx.requestId });
    if (!computerId || !ID.test(computerId) || !workspaceId || !actorId || !apiKey) {
      throw failure('service_unavailable', 'No Orgo computer is configured.');
    }
    if (ctx.workspaceId !== workspaceId || ctx.caller.id !== actorId) {
      throw failure('forbidden', 'This computer is assigned to a different operator.');
    }
    const { runId, task, connectionId, modelId } = readInput(raw, ctx);
    const { db, connections, secrets, capacity, usage, computerFactory = createOrgoComputer } = this.services;
    const connection = await connections.getConnection(connectionId, ctx);
    if (!connection || connection.status !== 'active' || !connection.eligibleModels.includes(modelId)) {
      throw failure('invalid_request', 'Select an eligible model from an active provider connection.');
    }
    const secret = connection.secretRef ? await secrets.getSecret(connection.secretRef, ctx) : null;
    if (connection.secretRef && !secret) throw failure('conflict', 'The provider credentials have changed.');
    const decide = createComputerDecisionMaker({ connection, modelId, secret, runId, usage, ctx });
    const computer = computerFactory(computerId, apiKey);
    const timeout = AbortSignal.timeout(RUN_TIMEOUT_MS);
    const signal = AbortSignal.any([timeout, requestSignal]);
    const lockId = `lock_${computerId.toLowerCase()}`;
    const release = capacity.acquire(ctx);
    try {
      signal.throwIfAborted();
      db.write(() => {
        if (db.get('computer_runs', workspaceId, runId)) {
          throw failure('conflict', 'This computer run ID was already used.');
        }
        const current = db.get<{ expiresAt: number }>('computer_runs', workspaceId, lockId);
        const now = Date.now();
        if (current && current.expiresAt > now) throw failure('conflict', 'The assigned computer is busy.');
        db.put('computer_runs', workspaceId, lockId, { runId, expiresAt: now + LOCK_TTL_MS });
        db.put('computer_runs', workspaceId, runId, { status: 'running', actorId, computerId, connectionId, modelId });
      });
      let status: ComputerAgentResult['status'] | 'failed' = 'failed';
      try {
        const result = await runComputerAgent(task, signal, {
          observe: computer.observe,
          decide,
          async dispatch(action, step, actionSignal) {
            actionSignal.throwIfAborted();
            const actionId = `action_${runId}_${step}`;
            const intent = {
              runId, computerId, kind: action.action,
              inputDigest: createHash('sha256').update(JSON.stringify(action)).digest('hex'),
            };
            db.write(() => {
              const lock = db.get<{ runId: string; expiresAt: number }>('computer_runs', workspaceId, lockId);
              if (lock?.runId !== runId || lock.expiresAt <= Date.now() ||
                  db.get('computer_actions', workspaceId, actionId)) {
                throw failure('conflict', 'The computer run no longer owns this action.');
              }
              db.put('computer_actions', workspaceId, actionId, { ...intent, status: 'dispatching' });
            });
            let completed = false;
            try {
              await computer.act(action, actionSignal);
              completed = true;
            } finally {
              db.write(() => db.put('computer_actions', workspaceId, actionId, {
                ...intent, status: completed ? 'completed' : 'unknown',
              }));
            }
          },
        });
        status = result.status;
        return { runId, ...result };
      } finally {
        db.write(() => {
          db.put('computer_runs', workspaceId, runId, { status, actorId, computerId, connectionId, modelId });
          const lock = db.get<{ runId: string }>('computer_runs', workspaceId, lockId);
          if (lock?.runId === runId) db.delete('computer_runs', workspaceId, lockId);
        });
      }
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      if (signal.aborted) throw failure('upstream_timeout', 'The computer run was interrupted.');
      throw failure('upstream_failed', 'The computer agent could not complete the run. A dispatched action may have taken effect.');
    } finally {
      release();
    }
  }
}
