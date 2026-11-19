import { createHash } from 'node:crypto';
import { scenarioFromModelId, type FixtureScenario } from './scenario';
import {
  type HarnessModelRequest,
  type HarnessModelResponse,
  type HarnessScope,
  type HarnessSubmission,
  type HarnessToolResult,
  type HarnessVerificationResult,
  type HarnessWorkspaceRef,
  type IHarnessInference,
  type IHarnessStore,
  type IHarnessVerifier,
  type IHarnessWorkspace,
} from './contracts';

export { scriptedModelId, scenarioFromModelId, type FixtureScenario } from './scenario';

/**
 * Scripted provider for H0/H1. It produces a complete text/tool-call/final
 * conversation without a network attempt, so the runner contract can be
 * verified before a real model is qualified in H2.
 */
export class ScriptedInference implements IHarnessInference {
  async complete(request: HarnessModelRequest, scope: HarnessScope): Promise<HarnessModelResponse> {
    void scope;
    const scenario = scenarioFromModelId(request.modelId);
    const attemptId = `attempt_${request.runId}_${request.step}`;

    if (scenario === 'cancel') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        request.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
      return { attemptId, text: '', toolCalls: [], finishReason: 'cancelled' };
    }

    if (request.step === 1) {
      const toolCalls = scenario === 'malformed'
        ? [{ id: `call_${request.runId}_1`, name: 'fixture.inert', arguments: {} }]
        : [{
            id: `call_${request.runId}_1`,
            name: 'fixture.inert',
            version: 1,
            arguments: { probe: 'zero-value-display', expect: 'preserved' },
          }];
      return {
        attemptId,
        text: 'Inspecting the granted repository fixture for the zero-value regression.\n',
        toolCalls,
        finishReason: 'tool_calls',
      };
    }

    return {
      attemptId,
      text: 'Inspection complete. The candidate is ready for verification.\n',
      toolCalls: [],
      finishReason: 'stop',
    };
  }
}

interface FixtureWorkspaceState {
  repositoryId: string;
  baseRevision: string;
  scenario: FixtureScenario;
  zeroValue: string;
  baselineEdits: string[];
  candidateDigest: string;
}

interface StoredAction {
  actionId: string;
  result: HarnessToolResult;
  recordedAt: string;
}

function digestCandidate(zeroValue: string, baselineEdits: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ zeroValue, baselineEdits }))
    .digest('hex')
    .slice(0, 24);
}

/**
 * Controlled in-memory repository fixture. The known defect drops a valid
 * zero value and there is one unrelated dirty file that must survive.
 */
export class FixtureWorkspace implements IHarnessWorkspace {
  constructor(private readonly store: IHarnessStore) {}

  private key(repositoryId: string): string {
    return `repo:${repositoryId}`;
  }

  private read(repositoryId: string, scope: HarnessScope): FixtureWorkspaceState | null {
    return this.store.get<FixtureWorkspaceState>('harness_workspaces', scope.workspaceId, this.key(repositoryId));
  }

  prepare(submission: HarnessSubmission, scope: HarnessScope): HarnessWorkspaceRef {
    const existing = this.read(submission.scope.repositoryId, scope);
    if (existing) return this.ref(existing);
    const scenario = scenarioFromModelId(submission.pinned.modelId);
    const state: FixtureWorkspaceState = {
      repositoryId: submission.scope.repositoryId,
      baseRevision: submission.pinned.baseRevision,
      scenario,
      zeroValue: scenario === 'fail' ? '' : '0',
      baselineEdits: ['notes/unrelated.md'],
      candidateDigest: '',
    };
    state.candidateDigest = digestCandidate(state.zeroValue, state.baselineEdits);
    this.store.put('harness_workspaces', scope.workspaceId, this.key(state.repositoryId), state);
    return this.ref(state);
  }

  candidate(submission: HarnessSubmission, scope: HarnessScope): HarnessWorkspaceRef {
    const state = this.read(submission.scope.repositoryId, scope);
    return state ? this.ref(state) : this.prepare(submission, scope);
  }

  recordAction(actionId: string, result: HarnessToolResult, scope: HarnessScope): void {
    this.store.write(() => {
      const existing = this.store.get<StoredAction>('harness_actions', scope.workspaceId, actionId);
      if (existing) return;
      this.store.put<StoredAction>('harness_actions', scope.workspaceId, actionId, {
        actionId,
        result,
        recordedAt: new Date().toISOString(),
      });
    });
  }

  reconcile(actionId: string, scope: HarnessScope): HarnessToolResult | null {
    return this.store.get<StoredAction>('harness_actions', scope.workspaceId, actionId)?.result ?? null;
  }

  zeroValue(repositoryId: string, scope: HarnessScope): string {
    return this.read(repositoryId, scope)?.zeroValue ?? '';
  }

  repair(repositoryId: string, scope: HarnessScope): void {
    this.store.write(() => {
      const state = this.read(repositoryId, scope);
      if (!state) return;
      state.zeroValue = '0';
      state.candidateDigest = digestCandidate(state.zeroValue, state.baselineEdits);
      this.store.put('harness_workspaces', scope.workspaceId, this.key(repositoryId), state);
    });
  }

  private ref(state: FixtureWorkspaceState): HarnessWorkspaceRef {
    return {
      repositoryId: state.repositoryId,
      baseRevision: state.baseRevision,
      candidateDigest: state.candidateDigest,
      baselineEdits: [...state.baselineEdits],
    };
  }
}

/** Deterministic verifier. The implementer's completion claim is informational. */
export class FixtureVerifier implements IHarnessVerifier {
  constructor(private readonly workspace: FixtureWorkspace) {}

  verify(submission: HarnessSubmission, workspace: HarnessWorkspaceRef, scope: HarnessScope): HarnessVerificationResult {
    const results = submission.acceptance.map((criterion) => {
      if (criterion.check === 'fixture.check.preserveZero') {
        const state = this.workspace.zeroValue(submission.scope.repositoryId, scope);
        const passed = state.length > 0;
        return {
          criterionId: criterion.id,
          check: criterion.check,
          status: passed ? 'pass' as const : 'fail' as const,
          evidenceRef: `harness://evidence/${submission.sessionId}/${criterion.id}/${workspace.candidateDigest}`,
          detail: passed
            ? `Valid zero value '${state}' preserved; unrelated edits retained.`
            : 'The formatter dropped the valid zero value.',
        };
      }
      if (criterion.check === 'fixture.check.command') {
        return {
          criterionId: criterion.id,
          check: criterion.check,
          status: 'pass' as const,
          evidenceRef: `harness://evidence/${submission.sessionId}/${criterion.id}/${workspace.candidateDigest}`,
          detail: 'Predefined verification command completed against the candidate digest.',
        };
      }
      return {
        criterionId: criterion.id,
        check: criterion.check,
        status: 'blocked' as const,
        evidenceRef: `harness://evidence/${submission.sessionId}/${criterion.id}/missing`,
        detail: 'The declared check is not available in this profile.',
      };
    });

    const failedCriteria = results
      .filter((result, index) => submission.acceptance[index].required && result.status !== 'pass')
      .map((result) => result.criterionId);
    return {
      runId: '',
      candidateDigest: workspace.candidateDigest,
      results,
      verdict: failedCriteria.length === 0 ? 'completed' : 'failed',
      failedCriteria,
      verifiedAt: new Date().toISOString(),
    };
  }
}
