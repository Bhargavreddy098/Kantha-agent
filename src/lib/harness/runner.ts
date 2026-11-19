import {
  HarnessError,
  type HarnessCheckpoint,
  type HarnessClaim,
  type HarnessOutcome,
  type HarnessScope,
  type HarnessSubmission,
  type HarnessToolResult,
  type IHarnessInference,
  type IHarnessJournal,
  type IHarnessProjection,
  type IHarnessVerifier,
  type IHarnessWorkspace,
  type IToolRegistry,
} from './contracts';

const ACTION_PREFIX = 'action_';

function actionId(runId: string, callId: string): string {
  return `${ACTION_PREFIX}${runId}_${callId}`;
}

function chunks(text: string, size = 96): string[] {
  const result: string[] = [];
  for (let index = 0; index < text.length; index += size) result.push(text.slice(index, index + size));
  return result;
}

/**
 * Bounded single-session runner. Every durable mutation is fenced by the
 * writer claim, and completed tool results are reused before any dependent
 * model step so recovery never repeats a settled effect.
 */
export class HarnessRunner {
  constructor(private readonly services: {
    journal: IHarnessJournal;
    inference: IHarnessInference;
    tools: IToolRegistry;
    workspace: IHarnessWorkspace;
    verifier: IHarnessVerifier;
    projection: IHarnessProjection;
  }) {}

  async execute(submission: HarnessSubmission, runId: string, claim: HarnessClaim, scope: HarnessScope): Promise<HarnessOutcome> {
    const { journal, inference, tools, workspace, verifier, projection } = this.services;
    const profile = submission.pinned.profile;
    const startedAt = Date.now();
    const checkpoint = this.initialize(runId, submission, claim, scope);
    const signal = projection.signal(runId, scope);
    const history: string[] = checkpoint.assistantText ? [checkpoint.assistantText] : [];
    for (const result of Object.values(checkpoint.toolResults)) history.push(result.content);

    try {
      checkpoint.phase = 'preparing';
      journal.append({ runId, type: 'step', step: checkpoint.step, data: { phase: 'preparing' } }, claim.generation, scope);
      this.save(checkpoint, claim, scope);
      workspace.prepare(submission, scope);
      checkpoint.phase = 'executing';
      this.save(checkpoint, claim, scope);

      while (checkpoint.step < profile.maxSteps) {
        journal.assertClaim(runId, claim.generation, scope);
        if (signal.aborted) return this.finalize(submission, checkpoint, claim, scope, { status: 'cancelled' });
        if (Date.now() - startedAt > profile.maxElapsedMs) {
          return this.finalize(submission, checkpoint, claim, scope, { status: 'cancelled', reason: 'Run elapsed limit reached' });
        }

        const step = checkpoint.step + 1;
        const response = await inference.complete({
          runId,
          modelId: submission.pinned.modelId,
          step,
          task: submission.task,
          history: [...history],
          tools: tools.snapshot(),
          signal,
        }, scope);

        if (response.finishReason === 'cancelled' || signal.aborted) {
          return this.finalize(submission, checkpoint, claim, scope, { status: 'cancelled' });
        }

        checkpoint.step = step;
        if (response.text) {
          const messageId = `assistant_${runId}`;
          for (const delta of chunks(response.text)) {
            journal.assertClaim(runId, claim.generation, scope);
            checkpoint.assistantText += delta;
            await projection.appendAssistantText(runId, messageId, delta, scope);
            journal.append({ runId, type: 'delta', step, data: { delta } }, claim.generation, scope);
          }
          history.push(response.text);
        }

        for (const call of response.toolCalls) {
          journal.assertClaim(runId, claim.generation, scope);
          const existing = checkpoint.toolResults[call.id];
          if (existing) {
            history.push(existing.content);
            continue;
          }
          checkpoint.pendingCallId = call.id;
          checkpoint.pendingActionId = actionId(runId, call.id);
          journal.append({ runId, type: 'tool_proposed', step, data: { callId: call.id, tool: call.name } }, claim.generation, scope);
          this.save(checkpoint, claim, scope);

          let result: HarnessToolResult;
          const reconciled = workspace.reconcile(checkpoint.pendingActionId, scope);
          if (reconciled) {
            result = reconciled;
          } else {
            try {
              const definition = tools.resolve(call, scope);
              result = tools.execute(definition, call, checkpoint.pendingActionId, scope);
              workspace.recordAction(checkpoint.pendingActionId, result, scope);
            } catch (error) {
              result = {
                callId: call.id,
                actionId: checkpoint.pendingActionId,
                toolId: call.name,
                version: call.version ?? 0,
                status: error instanceof HarnessError && error.code === 'denied' ? 'denied' : 'failed',
                content: error instanceof Error ? error.message : 'Tool call failed',
                ui: { label: call.name, status: 'error' },
              };
            }
          }

          checkpoint.completedCallIds.push(call.id);
          checkpoint.toolResults[call.id] = result;
          checkpoint.pendingCallId = undefined;
          checkpoint.pendingActionId = undefined;
          journal.append({ runId, type: 'tool_result', step, data: { callId: call.id, result } }, claim.generation, scope);
          this.save(checkpoint, claim, scope);
          history.push(result.content);

          if (result.status === 'denied' || result.status === 'failed') {
            return this.finalize(submission, checkpoint, claim, scope, { status: 'failed', reason: result.content });
          }
          if (result.status === 'uncertain') {
            return this.finalize(submission, checkpoint, claim, scope, { status: 'interrupted', reason: 'Tool outcome could not be reconciled' });
          }
        }

        this.save(checkpoint, claim, scope);
        if (response.finishReason === 'stop') break;
      }

      checkpoint.phase = 'verifying';
      this.save(checkpoint, claim, scope);
      journal.append({ runId, type: 'step', step: checkpoint.step, data: { phase: 'verifying' } }, claim.generation, scope);

      let verification = verifier.verify(submission, workspace.candidate(submission, scope), scope);
      verification = { ...verification, runId };
      while (verification.verdict === 'failed' && checkpoint.repairCount < profile.maxRepairs) {
        journal.assertClaim(runId, claim.generation, scope);
        workspace.repair(submission.scope.repositoryId, scope);
        checkpoint.repairCount += 1;
        verification = { ...verifier.verify(submission, workspace.candidate(submission, scope), scope), runId };
      }
      checkpoint.verification = verification;
      journal.append({ runId, type: 'verification', step: checkpoint.step, data: { verification } }, claim.generation, scope);
      this.save(checkpoint, claim, scope);

      const outcome: HarnessOutcome = verification.verdict === 'completed'
        ? { status: 'completed', verification, diffDigest: verification.candidateDigest }
        : {
            status: 'failed',
            verification,
            reason: `Required checks failed: ${verification.failedCriteria.join(', ')}`,
            nextAction: 'Repair the failed criteria and resubmit with a new input identity.',
          };
      return this.finalize(submission, checkpoint, claim, scope, outcome);
    } catch (error) {
      if (error instanceof HarnessError && error.code === 'stale_claim') {
        return { status: 'interrupted', reason: error.message };
      }
      if (signal.aborted) return this.finalize(submission, checkpoint, claim, scope, { status: 'cancelled' });
      return this.finalize(submission, checkpoint, claim, scope, {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Harness execution failed',
      });
    }
  }

  /** Reconcile a pending intent before continuing under a fresh claim. */
  async resume(submission: HarnessSubmission, runId: string, claim: HarnessClaim, scope: HarnessScope): Promise<HarnessOutcome> {
    const { journal, workspace } = this.services;
    const checkpoint = journal.getCheckpoint(runId, scope);
    if (checkpoint?.outcome) return checkpoint.outcome;
    if (checkpoint?.pendingActionId) {
      const receipt = workspace.reconcile(checkpoint.pendingActionId, scope);
      if (!receipt) {
        return {
          status: 'interrupted',
          reason: 'An in-flight action has no authoritative receipt and cannot be repeated safely.',
          nextAction: 'Reconcile the action by its ID before resuming dependent work.',
        };
      }
      checkpoint.toolResults[checkpoint.pendingCallId ?? ''] = receipt;
      if (checkpoint.pendingCallId && !checkpoint.completedCallIds.includes(checkpoint.pendingCallId)) {
        checkpoint.completedCallIds.push(checkpoint.pendingCallId);
      }
      checkpoint.pendingCallId = undefined;
      checkpoint.pendingActionId = undefined;
      journal.saveCheckpoint(checkpoint, claim.generation, scope);
    }
    return this.execute(submission, runId, claim, scope);
  }

  private initialize(runId: string, submission: HarnessSubmission, claim: HarnessClaim, scope: HarnessScope): HarnessCheckpoint {
    const { journal } = this.services;
    return journal.getCheckpoint(runId, scope) ?? {
      runId,
      inputId: submission.inputId,
      phase: 'admitted',
      step: 0,
      inputPosition: 0,
      lastSourceEventId: '',
      completedCallIds: [],
      toolResults: {},
      assistantText: '',
      repairCount: 0,
      claimGeneration: claim.generation,
      updatedAt: new Date().toISOString(),
    };
  }

  private save(checkpoint: HarnessCheckpoint, claim: HarnessClaim, scope: HarnessScope): void {
    checkpoint.claimGeneration = claim.generation;
    checkpoint.updatedAt = new Date().toISOString();
    this.services.journal.saveCheckpoint(checkpoint, claim.generation, scope);
  }

  private async finalize(
    submission: HarnessSubmission,
    checkpoint: HarnessCheckpoint,
    claim: HarnessClaim,
    scope: HarnessScope,
    outcome: HarnessOutcome,
  ): Promise<HarnessOutcome> {
    const { journal, projection } = this.services;
    journal.assertClaim(checkpoint.runId, claim.generation, scope);
    checkpoint.phase = 'finalizing';
    checkpoint.outcome = outcome;
    journal.append({ runId: checkpoint.runId, type: 'handoff', step: checkpoint.step, data: { outcome } }, claim.generation, scope);
    this.save(checkpoint, claim, scope);
    await projection.finish(checkpoint.runId, outcome, scope);
    return outcome;
  }
}
