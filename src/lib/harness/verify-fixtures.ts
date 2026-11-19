/**
 * H0/H1 fixture verification. Runs the durable harness contract in memory so
 * admission, fencing, tool correlation, verification and recovery are checked
 * without a provider, a browser or a deployment.
 */
import { setTimeout as delay } from 'node:timers/promises';
import { GatewayApprovalService } from '../gateway/server/approval-service';
import { GatewayRunService } from '../gateway/runs/session-service';
import { GatewayDatabase } from '../gateway/server/storage/database';
import { createHarness } from './create';
import {
  HarnessError,
  type HarnessOutcome,
  type HarnessScope,
  type HarnessSubmission,
  type IHarnessProjection,
  type IHarnessStore,
  type NewHarnessEvent,
  type StoredHarnessEvent,
} from './contracts';
import { FixtureVerifier, FixtureWorkspace, ScriptedInference, scriptedModelId } from './fixture';
import { HarnessJournal, submissionDigest } from './journal';
import { HarnessRunner } from './runner';
import { parseSubmission } from './service';
import { HarnessToolRegistry } from './tools';

const scope: HarnessScope = { workspaceId: 'ws_fixture', actorId: 'usr_fixture', requestId: 'req_fixture' };

class MemoryStore implements IHarnessStore {
  readonly documents = new Map<string, unknown>();
  readonly events: StoredHarnessEvent[] = [];

  private key(collection: string, scopeId: string, id: string): string {
    return JSON.stringify([collection, scopeId, id]);
  }

  write<T>(operation: () => T): T {
    return operation();
  }

  get<T>(collection: string, scopeId: string, id: string): T | null {
    return (this.documents.get(this.key(collection, scopeId, id)) as T | undefined) ?? null;
  }

  list<T>(collection: string, scopeId: string): T[] {
    const prefix = JSON.stringify([collection, scopeId]);
    return [...this.documents.entries()]
      .filter(([key]) => key.startsWith(prefix.slice(0, -1)))
      .map(([, value]) => value as T);
  }

  put<T>(collection: string, scopeId: string, id: string, value: T): void {
    this.documents.set(this.key(collection, scopeId, id), value);
  }

  appendEvent(_scopeId: string, event: NewHarnessEvent): StoredHarnessEvent {
    const recorded = { ...event, sequence: this.events.length + 1 };
    this.events.push(recorded);
    return recorded;
  }

  readEvents(_scopeId: string, _sessionId: string, cursor: number, limit: number): StoredHarnessEvent[] {
    return this.events.filter((event) => event.sequence > cursor).slice(0, limit);
  }
}

class RecordingProjection implements IHarnessProjection {
  readonly deltas: string[] = [];
  readonly published: string[] = [];
  finished?: HarnessOutcome;
  readonly controller = new AbortController();

  async appendAssistantText(_runId: string, _messageId: string, delta: string): Promise<void> {
    this.deltas.push(delta);
  }

  publish(type: string): void {
    this.published.push(type);
  }

  signal(): AbortSignal {
    return this.controller.signal;
  }

  async finish(_runId: string, outcome: HarnessOutcome): Promise<void> {
    this.finished = outcome;
  }
}

function rawSubmission(scenario: string, inputId = 'input-1') {
  return {
    inputId,
    sessionId: 'ses_fixture',
    task: `Verify the zero-value fixture (${scenario}).`,
    scope: { repositoryId: 'fixture-repository', allowedRoots: ['src/'] },
    pinned: { baseRevision: 'fixture-base', modelId: scriptedModelId(scenario as 'pass' | 'fail') },
    acceptance: [
      { id: 'preserve-zero-value', behavior: 'preserve zero', check: 'fixture.check.preserveZero', required: true },
      { id: 'repository-check', behavior: 'pass check', check: 'fixture.check.command', required: true },
    ],
  };
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Harness fixture assertion failed: ' + message);
}

function expectCode(code: HarnessError['code'], operation: () => unknown): void {
  try {
    operation();
  } catch (error) {
    if (error instanceof HarnessError && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected HarnessError '${code}' but no error was thrown.`);
}

interface Fixture {
  store: MemoryStore;
  journal: HarnessJournal;
  workspace: FixtureWorkspace;
  projection: RecordingProjection;
  runner: HarnessRunner;
  submission: HarnessSubmission;
}

function setup(scenario: string, inputId?: string): Fixture {
  const store = new MemoryStore();
  const journal = new HarnessJournal(store);
  const tools = new HarnessToolRegistry();
  const workspace = new FixtureWorkspace(store);
  const verifier = new FixtureVerifier(workspace);
  const projection = new RecordingProjection();
  const runner = new HarnessRunner({
    journal,
    inference: new ScriptedInference(),
    tools,
    workspace,
    verifier,
    projection,
  });
  const submission = parseSubmission(rawSubmission(scenario, inputId));
  return { store, journal, workspace, projection, runner, submission };
}

async function assertPassingRun(): Promise<void> {
  const fixture = setup('pass');
  const admission = fixture.journal.admit(fixture.submission, 'run_pass', scope);
  const claim = fixture.journal.claim('run_pass', 'owner_a', 15_000, scope);
  await fixture.runner.execute(fixture.submission, 'run_pass', claim, scope);

  expect(admission.digest === submissionDigest(fixture.submission), 'admission digest is stable');
  const entries = fixture.journal.read('run_pass', scope);
  expect(entries.some((entry) => entry.type === 'tool_proposed'), 'tool proposal is journaled');
  const results = entries.filter((entry) => entry.type === 'tool_result');
  expect(results.length === 1, 'exactly one terminal tool result');
  const result = results[0].data.result as { callId: string; actionId: string; status: string };
  expect(result.callId === 'call_run_pass_1', 'tool call ID is stable');
  expect(result.actionId.startsWith('action_run_pass_'), 'action ID is correlated');
  expect(result.status === 'completed', 'inert tool completed');
  expect(fixture.projection.deltas.join('').includes('Inspecting'), 'text deltas stream to the projection');
  expect(fixture.projection.finished?.status === 'completed', 'run completes');
  expect(fixture.projection.finished?.verification?.verdict === 'completed', 'verification passes');
  const checkpoint = fixture.journal.getCheckpoint('run_pass', scope);
  expect(checkpoint?.step === 2, 'two model steps completed');
  expect(checkpoint?.completedCallIds.length === 1, 'completed call is remembered');
  const sourceIds = new Set(entries.map((entry) => entry.sourceEventId));
  expect(sourceIds.size === entries.length, 'source event IDs are stable and unique');
}

async function assertFailingVerification(): Promise<void> {
  const fixture = setup('fail');
  fixture.journal.admit(fixture.submission, 'run_fail', scope);
  const claim = fixture.journal.claim('run_fail', 'owner_a', 15_000, scope);
  const outcome = await fixture.runner.execute(fixture.submission, 'run_fail', claim, scope);
  expect(outcome.status === 'failed', 'failed check produces a failed run');
  expect(outcome.verification?.failedCriteria[0] === 'preserve-zero-value', 'failed criterion is named');
  expect((outcome.nextAction ?? '').length > 0, 'a concrete handoff is recorded');
  expect(fixture.journal.read('run_fail', scope).some((entry) => entry.type === 'verification'), 'verification is journaled');
}

async function assertMalformedToolCall(): Promise<void> {
  const fixture = setup('malformed');
  fixture.journal.admit(fixture.submission, 'run_bad', scope);
  const claim = fixture.journal.claim('run_bad', 'owner_a', 15_000, scope);
  const outcome = await fixture.runner.execute(fixture.submission, 'run_bad', claim, scope);
  expect(outcome.status === 'failed', 'invalid tool call fails the run');
  expect(outcome.reason?.includes('missing required argument') === true, 'typed validation reason is retained');
  const receipts = fixture.store.list<unknown>('harness_actions', scope.workspaceId);
  expect(receipts.length === 0, 'invalid call produces zero dispatch receipts');
}

async function assertCancellation(): Promise<void> {
  const fixture = setup('cancel');
  fixture.journal.admit(fixture.submission, 'run_cancel', scope);
  const claim = fixture.journal.claim('run_cancel', 'owner_a', 15_000, scope);
  fixture.projection.controller.abort();
  const outcome = await fixture.runner.execute(fixture.submission, 'run_cancel', claim, scope);
  expect(outcome.status === 'cancelled', 'Stop produces a cancelled outcome');
}

function assertAdmissionAndFencing(): void {
  const fixture = setup('pass');
  const admission = fixture.journal.admit(fixture.submission, 'run_fence', scope);
  const replay = fixture.journal.admit(fixture.submission, 'run_fence', scope);
  expect(admission.runId === replay.runId && admission.digest === replay.digest, 'identical submission replays one admission');

  const changed = parseSubmission({ ...rawSubmission('pass'), task: 'A different task.' });
  expectCode('conflict', () => fixture.journal.admit(changed, 'run_fence', scope));

  const ownerA = fixture.journal.claim('run_fence', 'owner_a', 15_000, scope);
  expectCode('conflict', () => fixture.journal.claim('run_fence', 'owner_b', 15_000, scope));
  fixture.journal.append({ runId: 'run_fence', type: 'step', step: 1, data: { phase: 'executing' } }, ownerA.generation, scope);
  expectCode('stale_claim', () => fixture.journal.append(
    { runId: 'run_fence', type: 'step', step: 2, data: { phase: 'executing' } }, ownerA.generation - 1, scope));

  fixture.store.put('harness_claims', scope.workspaceId, 'run_fence', { ...ownerA, expiresAt: Date.now() - 1 });
  const ownerB = fixture.journal.reclaim('run_fence', 'owner_b', 15_000, scope);
  expect(ownerB?.generation === ownerA.generation + 1, 'recovery bumps the claim generation');
  expectCode('stale_claim', () => fixture.journal.append(
    { runId: 'run_fence', type: 'step', step: 3, data: { phase: 'executing' } }, ownerA.generation, scope));
  fixture.journal.assertClaim('run_fence', ownerB!.generation, scope);
}

async function assertPendingRecovery(): Promise<void> {
  const fixture = setup('pass');
  fixture.journal.admit(fixture.submission, 'run_recover', scope);
  const claim = fixture.journal.claim('run_recover', 'owner_a', 15_000, scope);
  fixture.journal.saveCheckpoint({
    runId: 'run_recover',
    inputId: 'input-1',
    phase: 'executing',
    step: 1,
    inputPosition: 1,
    lastSourceEventId: '',
    pendingCallId: 'call_run_recover_1',
    pendingActionId: 'action_run_recover_call_run_recover_1',
    completedCallIds: [],
    toolResults: {},
    assistantText: 'Partial output',
    repairCount: 0,
    claimGeneration: claim.generation,
    updatedAt: new Date().toISOString(),
  }, claim.generation, scope);

  fixture.store.put('harness_submissions', scope.workspaceId, 'run_recover', fixture.submission);
  fixture.store.put('runs', scope.workspaceId, 'run_recover', { run: { id: 'run_recover', status: 'running' } });

  const unresolved = await fixture.runner.resume(fixture.submission, 'run_recover', claim, scope);
  expect(unresolved.status === 'interrupted', 'unresolved intent halts dependent work');

  fixture.workspace.recordAction('action_run_recover_call_run_recover_1', {
    callId: 'call_run_recover_1',
    actionId: 'action_run_recover_call_run_recover_1',
    toolId: 'fixture.inert',
    version: 1,
    status: 'completed',
    content: '{"probe":"zero-value-display"}',
  }, scope);
  const recovered = await fixture.runner.resume(fixture.submission, 'run_recover', claim, scope);
  expect(recovered.status === 'completed', 'a matching receipt lets recovery continue');
  const checkpoint = fixture.journal.getCheckpoint('run_recover', scope);
  expect(checkpoint?.toolResults['call_run_recover_1']?.status === 'completed', 'existing result is reused once');
}

async function assertProjectionEvents(): Promise<void> {
  const fixture = setup('pass');
  fixture.journal.admit(fixture.submission, 'run_events', scope);
  const claim = fixture.journal.claim('run_events', 'owner_a', 15_000, scope);
  await fixture.runner.execute(fixture.submission, 'run_events', claim, scope);
  const types = fixture.store.events.map((event) => event.type);
  expect(types.includes('harness.step'), 'preparation step is projected');
  expect(types.includes('harness.delta'), 'streamed deltas are projected');
  expect(types.includes('harness.tool_result'), 'tool result is projected');
  expect(types.includes('harness.verification'), 'verification is projected');
  expect(types.includes('harness.handoff'), 'handoff is projected');
  const sequences = fixture.store.events.map((event) => event.sequence);
  expect(sequences.every((value, index) => index === 0 || value === sequences[index - 1] + 1), 'projection events are gap-free');
}

/** Exercises the real gateway store and run service without a browser or provider. */
async function assertServiceIntegration(): Promise<void> {
  const db = new GatewayDatabase(':memory:');
  try {
    const approvals = new GatewayApprovalService(db);
    const runs = new GatewayRunService(db, approvals);
    const composition = createHarness(db, runs);
    const requestContext = {
      requestId: scope.requestId,
      workspaceId: scope.workspaceId,
      caller: { type: 'user' as const, id: scope.actorId },
      timestamp: Date.now(),
    };
    const session = await runs.createSession({ title: 'Harness integration' }, requestContext);
    const raw = rawSubmission('pass', 'integration-input');
    const submitted = await composition.service.submit({ ...raw, sessionId: session.id }, scope);
    expect(submitted.replayed === false, 'new submission starts one run');

    const replay = await composition.service.submit({ ...raw, sessionId: session.id }, scope);
    expect(replay.runId === submitted.runId && replay.replayed === true, 'redelivery returns the same public run');
    let conflicted = false;
    try {
      await composition.service.submit({ ...raw, sessionId: session.id, task: 'A different task.' }, scope);
    } catch {
      conflicted = true;
    }
    expect(conflicted, 'a changed payload with the same identity conflicts');

    let view = await composition.service.view(submitted.runId, scope);
    for (let attempt = 0; attempt < 100 && view?.outcome === undefined; attempt += 1) {
      await delay(25);
      view = await composition.service.view(submitted.runId, scope);
    }
    expect(view?.outcome?.status === 'completed', 'the submitted run reaches a terminal outcome');
    expect(view?.status === 'completed', 'gateway public run status is completed');
    expect(view?.entries.some((entry) => entry.type === 'tool_result') === true, 'inert result is in the durable projection');

    const events = db.readEvents(scope.workspaceId, session.id, 0, 512);
    const types = new Set(events.map((event) => event.type));
    expect(types.has('run.state_changed'), 'gateway run state is projected');
    expect(types.has('run.delta'), 'assistant text streams into the existing gateway feed');
    expect(types.has('harness.tool_result'), 'harness tool state is projected through the same feed');
    expect(types.has('harness.verification'), 'verification is projected through the same feed');

    const cancelSession = await runs.createSession({ title: 'Harness cancellation' }, requestContext);
    const cancelled = await composition.service.submit(
      { ...rawSubmission('cancel', 'cancel-input'), sessionId: cancelSession.id }, scope);
    composition.service.cancel(cancelled.runId, 'Stopped from integration check', scope);
    let cancelView = await composition.service.view(cancelled.runId, scope);
    for (let attempt = 0; attempt < 40 && cancelView?.outcome === undefined; attempt += 1) {
      await delay(25);
      cancelView = await composition.service.view(cancelled.runId, scope);
    }
    expect(cancelView?.outcome?.status === 'cancelled', 'Stop finalizes the same public run');
    runs.shutdown();
  } finally {
    db.close();
  }
}

export interface HarnessFixtureResult {
  passed: boolean;
  testCount: number;
  errors: string[];
}

export async function runHarnessFixtureVerification(): Promise<HarnessFixtureResult> {
  const checks: Array<[string, () => void | Promise<void>]> = [
    ['scripted run completes with correlated tool and passing verification', assertPassingRun],
    ['failing verification produces a failed run with evidence', assertFailingVerification],
    ['invalid tool call produces a typed failure with zero dispatch', assertMalformedToolCall],
    ['Stop produces a cancelled outcome', assertCancellation],
    ['admission is idempotent and claims are fenced', assertAdmissionAndFencing],
    ['recovery reconciles pending intent before continuing', assertPendingRecovery],
    ['durable state is projected as gap-free versioned events', assertProjectionEvents],
    ['gateway store and run service project one replayable, cancellable run', assertServiceIntegration],
  ];
  const errors: string[] = [];
  for (const [name, check] of checks) {
    try {
      await check();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { passed: errors.length === 0, testCount: checks.length, errors };
}
