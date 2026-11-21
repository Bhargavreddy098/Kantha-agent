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

/** Proposed v1 run-profile bounds from HARNESS.md; caller overrides never exceed them. */
const V1_MAX_STEPS = 24;
const V1_MAX_ELAPSED_MS = 20 * 60_000;
const V1_MAX_TOOL_OUTPUT_BYTES = 8_192;

function capUtf8(value: string, limit: number): string {
  if (Buffer.byteLength(value, 'utf8') <= limit) return value;
  const truncated = Buffer.from(value, 'utf8').subarray(0, limit).toString('utf8');
  return `${truncated}…[truncated]`;
}

function actionId(runId: string, callId: string): string {
  return `${ACTION_PREFIX}${runId}_${callId}`;
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
    const requestedProfile = submission.pinned.profile;
    const profile = {
      ...requestedProfile,
      maxSteps: Math.min(requestedProfile.maxSteps, V1_MAX_STEPS),
      maxElapsedMs: Math.min(requestedProfile.maxElapsedMs, V1_MAX_ELAPSED_MS),
      maxToolOutputBytes: Math.min(requestedProfile.maxToolOutputBytes, V1_MAX_TOOL_OUTPUT_BYTES),
    };
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
          // Adjacent streamed text is batched into one part. The canonical
          // journal records (assistantMessageId, partId, deltaSequence) so a
          // reconnect can reconcile deltas without a refetch.
          const assistantMessageId = `assistant_${runId}`;
          const partId = `part_${runId}_${step}`;
          journal.assertClaim(runId, claim.generation, scope);
          checkpoint.assistantText += response.text;
          await projection.appendAssistantText(runId, assistantMessageId, response.text, scope);
          journal.append({
            runId,
            type: 'delta',
            step,
            data: { delta: response.text, assistantMessageId, partId, deltaSequence: 0 },
          }, claim.generation, scope);
          projection.publish('harness.message_delta', runId, {
            runId, assistantMessageId, partId, deltaSequence: 0, delta: response.text,
          }, scope);
          history.push(response.text);
        }

        // Persist the full ordered call list before dispatching call #1. A
        // recovery under a fresh claim can settle every sibling exactly once
        // rather than re-proposing an already-decided batch.
        checkpoint.plannedCalls = response.toolCalls.map((call) => ({ callId: call.id, name: call.name }));
        checkpoint.skippedCallIds = checkpoint.skippedCallIds ?? [];
        journal.append({
          runId, type: 'tool_batch', step, data: { calls: checkpoint.plannedCalls },
        }, claim.generation, scope);
        this.save(checkpoint, claim, scope);

        for (let index = 0; index < response.toolCalls.length; index += 1) {
          const call = response.toolCalls[index];
          journal.assertClaim(runId, claim.generation, scope);
          if (checkpoint.skippedCallIds?.includes(call.id)) continue;
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

          // Model-facing output is hard-capped regardless of caller profile.
          result = { ...result, content: capUtf8(result.content, profile.maxToolOutputBytes) };
          checkpoint.completedCallIds.push(call.id);
          checkpoint.toolResults[call.id] = result;
          checkpoint.pendingCallId = undefined;
          checkpoint.pendingActionId = undefined;
          journal.append({ runId, type: 'tool_result', step, data: { callId: call.id, result } }, claim.generation, scope);
          this.save(checkpoint, claim, scope);
          history.push(result.content);

          if (result.status === 'denied' || result.status === 'failed' || result.status === 'uncertain') {
            // Commit a terminal skipped result for every remaining sibling so
            // the next model step sees a complete batch, never stale work.
            for (const sibling of response.toolCalls.slice(index + 1)) {
              if (checkpoint.toolResults[sibling.id]) continue;
              const skipped: HarnessToolResult = {
                callId: sibling.id,
                actionId: actionId(runId, sibling.id),
                toolId: sibling.name,
                version: sibling.version ?? 0,
                status: 'denied',
                content: `Skipped: earlier call ${call.id} ${result.status}. No dispatch occurred.`,
                ui: { label: sibling.name, status: 'error' },
              };
              checkpoint.skippedCallIds?.push(sibling.id);
              checkpoint.toolResults[sibling.id] = skipped;
              journal.append({
                runId, type: 'tool_result', step,
                data: { callId: sibling.id, result: skipped, skipped: true },
              }, claim.generation, scope);
            }
            this.save(checkpoint, claim, scope);
            if (result.status === 'uncertain') {
              return this.finalize(submission, checkpoint, claim, scope, { status: 'interrupted', reason: 'Tool outcome could not be reconciled' });
            }
            return this.finalize(submission, checkpoint, claim, scope, { status: 'failed', reason: result.content });
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
