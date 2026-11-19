import type { RequestContext } from '../gateway/contracts/context';
import type { GatewayRunService } from '../gateway/runs/session-service';
import {
  HarnessError,
  type HarnessOutcome,
  type HarnessScope,
  type HarnessSubmission,
  type HarnessAcceptanceCriterion,
  type HarnessRunProfile,
  type HarnessRunView,
} from './contracts';
import type { IHarnessJournal, IHarnessProjection, IHarnessStore } from './contracts';
import { HarnessRunner } from './runner';

const defaultProfile: HarnessRunProfile = {
  maxSteps: 6,
  maxRepairs: 0,
  maxElapsedMs: 30_000,
  maxToolOutputBytes: 8_192,
  leaseMs: 15_000,
};

const defaultAcceptance: HarnessAcceptanceCriterion[] = [
  {
    id: 'preserve-zero-value',
    behavior: 'A valid zero value is preserved by the display formatter.',
    check: 'fixture.check.preserveZero',
    required: true,
  },
  {
    id: 'repository-check',
    behavior: 'The declared repository check passes against the final candidate.',
    check: 'fixture.check.command',
    required: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSubmission(raw: unknown): HarnessSubmission {
  if (!isRecord(raw)) throw new HarnessError('invalid_submission', 'A harness submission object is required.');
  const inputId = typeof raw.inputId === 'string' ? raw.inputId.trim() : '';
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : '';
  const task = typeof raw.task === 'string' ? raw.task.trim() : '';
  if (!inputId || !sessionId || !task) {
    throw new HarnessError('invalid_submission', 'inputId, sessionId and task are required.');
  }
  const rawScope = isRecord(raw.scope) ? raw.scope : {};
  const repositoryId = typeof rawScope.repositoryId === 'string' && rawScope.repositoryId.trim()
    ? rawScope.repositoryId.trim()
    : 'fixture-repository';
  const allowedRoots = Array.isArray(rawScope.allowedRoots)
    ? rawScope.allowedRoots.filter((root): root is string => typeof root === 'string')
    : ['.'];
  const rawPinned = isRecord(raw.pinned) ? raw.pinned : {};
  const rawProfile = isRecord(rawPinned.profile) ? rawPinned.profile : {};
  const profile: HarnessRunProfile = {
    maxSteps: typeof rawProfile.maxSteps === 'number' ? rawProfile.maxSteps : defaultProfile.maxSteps,
    maxRepairs: typeof rawProfile.maxRepairs === 'number' ? rawProfile.maxRepairs : defaultProfile.maxRepairs,
    maxElapsedMs: typeof rawProfile.maxElapsedMs === 'number' ? rawProfile.maxElapsedMs : defaultProfile.maxElapsedMs,
    maxToolOutputBytes: defaultProfile.maxToolOutputBytes,
    leaseMs: defaultProfile.leaseMs,
  };
  if (!Number.isInteger(profile.maxSteps) || profile.maxSteps < 1 || profile.maxSteps > 32) {
    throw new HarnessError('invalid_submission', 'maxSteps must be an integer between 1 and 32.');
  }
  const acceptance = Array.isArray(raw.acceptance) && raw.acceptance.length > 0
    ? raw.acceptance.filter((item): item is HarnessAcceptanceCriterion => isRecord(item)
        && typeof item.id === 'string' && typeof item.behavior === 'string'
        && typeof item.check === 'string' && typeof item.required === 'boolean')
    : defaultAcceptance;
  if (acceptance.length === 0) {
    throw new HarnessError('invalid_submission', 'No valid acceptance criteria were supplied.');
  }
  return {
    inputId,
    sessionId,
    task,
    scope: { repositoryId, allowedRoots },
    pinned: {
      repositoryId,
      baseRevision: typeof rawPinned.baseRevision === 'string' ? rawPinned.baseRevision : 'fixture-base',
      agentVersion: typeof rawPinned.agentVersion === 'string' ? rawPinned.agentVersion : 'harness-h1',
      toolVersion: 1,
      modelId: typeof rawPinned.modelId === 'string' ? rawPinned.modelId : 'harness.scripted.pass',
      profile,
    },
    acceptance,
  };
}

export function harnessScope(ctx: RequestContext): HarnessScope {
  return {
    workspaceId: ctx.workspaceId,
    actorId: ctx.caller.id,
    requestId: ctx.requestId,
  };
}

function toRequestContext(scope: HarnessScope): RequestContext {
  return {
    requestId: scope.requestId,
    workspaceId: scope.workspaceId,
    caller: { type: 'user', id: scope.actorId },
    timestamp: Date.now(),
  };
}

export class HarnessService {
  constructor(private readonly services: {
    store: IHarnessStore;
    journal: IHarnessJournal;
    projection: IHarnessProjection;
    runner: HarnessRunner;
    runs: Pick<GatewayRunService, 'beginRun' | 'getRun' | 'cancelRun' | 'getRunSignal'>;
  }) {}

  async submit(raw: unknown, scope: HarnessScope): Promise<{ runId: string; replayed: boolean; status: string }> {
    const submission = parseSubmission(raw);
    const ctx = toRequestContext(scope);
    const input = {
      sessionId: submission.sessionId,
      submissionKey: submission.inputId,
      modelId: submission.pinned.modelId,
      connectionId: '',
      inputMessages: [{
        id: `harness_input_${submission.inputId}`,
        role: 'user' as const,
        content: submission.task,
        parts: [{ type: 'text' as const, text: submission.task }],
      }],
      system: 'You are executing a bounded harness task.',
    };
    const started = await this.services.runs.beginRun(input, ctx);
    const admission = this.services.journal.admit(submission, started.run.id, scope);
    this.services.store.put('harness_submissions', scope.workspaceId, started.run.id, submission);

    if (started.created) {
      const claim = this.services.journal.claim(started.run.id, `runner_${scope.requestId}`, submission.pinned.profile.leaseMs, scope);
      void this.services.runner.execute(submission, started.run.id, claim, scope)
        .catch((error: unknown) => {
          console.error('Harness runner failed', { requestId: scope.requestId, error: error instanceof Error ? error.message : 'UnknownError' });
        });
    }
    return { runId: admission.runId, replayed: !started.created, status: 'running' };
  }

  async view(runId: string, scope: HarnessScope): Promise<HarnessRunView | null> {
    const { journal, runs } = this.services;
    const admission = journal.getByRun(runId, scope);
    if (!admission) return null;
    const checkpoint = journal.getCheckpoint(runId, scope);
    const entries = journal.read(runId, scope).slice(-128);
    const run = await runs.getRun(runId, toRequestContext(scope));
    return {
      runId,
      status: typeof run?.status === 'string' ? run.status : 'unknown',
      phase: checkpoint?.phase ?? 'admitted',
      step: checkpoint?.step ?? 0,
      outcome: checkpoint?.outcome,
      verification: checkpoint?.verification,
      entries,
    };
  }

  async cancel(runId: string, reason: string | undefined, scope: HarnessScope): Promise<void> {
    await this.services.runs.cancelRun(runId, reason ?? 'Cancelled by user', toRequestContext(scope));
  }

  /** Recover open runs whose writer lease expired using only durable records. */
  async recoverOpen(scope: HarnessScope): Promise<HarnessOutcome[]> {
    const { store, journal, runs, runner } = this.services;
    const open = journal.listOpen(scope);
    const outcomes: HarnessOutcome[] = [];
    for (const admission of open) {
      const submission = store.get<HarnessSubmission>('harness_submissions', scope.workspaceId, admission.runId);
      const run = await runs.getRun(admission.runId, toRequestContext(scope));
      if (!submission || !run || run.status !== 'running') continue;
      const claim = journal.reclaim(admission.runId, `recovery_${scope.requestId}`, submission.pinned.profile.leaseMs, scope);
      if (!claim) continue;
      outcomes.push(await runner.resume(submission, admission.runId, claim, scope));
    }
    return outcomes;
  }

  shutdown(): void {
    // The injected gateway run service owns active signals and aborts them on close.
  }
}
