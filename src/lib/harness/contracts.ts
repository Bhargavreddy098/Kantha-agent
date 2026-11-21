/**
 * Harness domain contracts.
 *
 * These types describe the durable execution contract of one harness session.
 * They deliberately carry no dependency on Next.js route handlers, provider
 * credentials or browser components. The gateway injects storage, policy,
 * inference and projection through the interfaces at the bottom of this file.
 */

export type HarnessPhase = 'admitted' | 'preparing' | 'executing' | 'verifying' | 'finalizing';

export type HarnessOutcomeStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted';

export type HarnessErrorCode =
  | 'invalid_submission'
  | 'conflict'
  | 'not_found'
  | 'stale_claim'
  | 'invalid_tool_call'
  | 'denied'
  | 'budget_denied'
  | 'unresolved';

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;

  constructor(code: HarnessErrorCode, message: string) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
  }
}

/** A caller/run scope. The gateway maps a RequestContext to this shape. */
export interface HarnessScope {
  workspaceId: string;
  actorId: string;
  requestId: string;
}

export interface HarnessRunProfile {
  maxSteps: number;
  maxRepairs: number;
  maxElapsedMs: number;
  maxToolOutputBytes: number;
  leaseMs: number;
}

/** Assets pinned at admission. Repository text can guide but never grant authority. */
export interface HarnessPinnedAssets {
  repositoryId: string;
  baseRevision: string;
  agentVersion: string;
  toolVersion: number;
  modelId: string;
  profile: HarnessRunProfile;
}

export interface HarnessAcceptanceCriterion {
  id: string;
  behavior: string;
  check: string;
  required: boolean;
}

export interface HarnessSubmission {
  /** Stable identity supplied by the caller; identical input replays one run. */
  inputId: string;
  sessionId: string;
  task: string;
  scope: { repositoryId: string; allowedRoots: string[] };
  pinned: HarnessPinnedAssets;
  acceptance: HarnessAcceptanceCriterion[];
}

export interface HarnessAdmission {
  runId: string;
  inputId: string;
  digest: string;
  sessionId: string;
  receivedAt: string;
}

export interface HarnessClaim {
  runId: string;
  generation: number;
  ownerId: string;
  expiresAt: number;
}

export type HarnessJournalEntryType =
  | 'admitted'
  | 'step'
  | 'delta'
  | 'tool_proposed'
  | 'tool_batch'
  | 'tool_result'
  | 'verification'
  | 'handoff';

export interface HarnessJournalEntry {
  id: string;
  sourceEventId: string;
  sequence: number;
  runId: string;
  type: HarnessJournalEntryType;
  step: number;
  data: Record<string, unknown>;
  occurredAt: string;
}

export interface HarnessToolCall {
  id: string;
  name: string;
  /** Pinned definition version from the advertised snapshot, when supplied. */
  version?: number;
  arguments: Record<string, unknown>;
}

export interface HarnessToolDefinition {
  id: string;
  version: number;
  capability: string;
  effect: 'none' | 'read' | 'write';
  inputSchema: { required: string[]; properties: Record<string, 'string' | 'number' | 'boolean'> };
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface HarnessToolResult {
  callId: string;
  actionId: string;
  toolId: string;
  version: number;
  status: 'completed' | 'failed' | 'denied' | 'uncertain';
  content: string;
  machine?: Record<string, unknown>;
  ui?: { label: string; status: 'ok' | 'error' };
  evidenceRef?: string;
}

export interface HarnessCheckResult {
  criterionId: string;
  check: string;
  status: 'pass' | 'fail' | 'blocked';
  evidenceRef: string;
  detail: string;
}

export interface HarnessVerificationResult {
  runId: string;
  candidateDigest: string;
  results: HarnessCheckResult[];
  verdict: 'completed' | 'failed';
  failedCriteria: string[];
  verifiedAt: string;
}

export interface HarnessOutcome {
  status: HarnessOutcomeStatus;
  reason?: string;
  verification?: HarnessVerificationResult;
  nextAction?: string;
  diffDigest?: string;
}

/** The checkpoint is the single durable cursor used for recovery. */
export interface HarnessCheckpoint {
  runId: string;
  inputId: string;
  phase: HarnessPhase;
  step: number;
  inputPosition: number;
  lastSourceEventId: string;
  pendingCallId?: string;
  pendingActionId?: string;
  /** Full ordered tool-call list from the current model step, persisted before dispatch. */
  plannedCalls?: Array<{ callId: string; name: string }>;
  /** Siblings settled as skipped after an earlier call failed. */
  skippedCallIds?: string[];
  completedCallIds: string[];
  toolResults: Record<string, HarnessToolResult>;
  assistantText: string;
  repairCount: number;
  verification?: HarnessVerificationResult;
  outcome?: HarnessOutcome;
  claimGeneration: number;
  updatedAt: string;
}

export type HarnessPhaseView = HarnessPhase | 'recovering';

/** Authorized browser projection of a harness run. No prompts or raw payloads. */
export interface HarnessRunView {
  runId: string;
  status: string;
  phase: HarnessPhaseView;
  step: number;
  outcome?: HarnessOutcome;
  verification?: HarnessVerificationResult;
  entries: HarnessJournalEntry[];
}

export interface HarnessSubmitResult {
  runId: string;
  replayed: boolean;
  status: string;
}

export interface NewHarnessEvent {
  id: string;
  sessionId: string;
  runId: string;
  type: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface StoredHarnessEvent extends NewHarnessEvent {
  sequence: number;
}

/**
 * Generic document store supplied by the gateway. Write is a serialized
 * transaction; appendEvent shares that transaction with state so projections
 * have stable, gap-free source event identities.
 */
export interface IHarnessStore {
  write<T>(operation: () => T): T;
  get<T>(collection: string, scope: string, id: string): T | null;
  list<T>(collection: string, scope: string): T[];
  put<T>(collection: string, scope: string, id: string, value: T): void;
  appendEvent(scope: string, event: NewHarnessEvent): StoredHarnessEvent;
  readEvents(scope: string, sessionId: string, cursor: number, limit: number): StoredHarnessEvent[];
}

export interface IHarnessJournal {
  admit(submission: HarnessSubmission, runId: string, scope: HarnessScope): HarnessAdmission;
  getByInput(inputId: string, scope: HarnessScope): HarnessAdmission | null;
  getByRun(runId: string, scope: HarnessScope): HarnessAdmission | null;
  listOpen(scope: HarnessScope): HarnessAdmission[];
  claim(runId: string, ownerId: string, leaseMs: number, scope: HarnessScope): HarnessClaim;
  reclaim(runId: string, ownerId: string, leaseMs: number, scope: HarnessScope): HarnessClaim | null;
  assertClaim(runId: string, generation: number, scope: HarnessScope): void;
  append(
    input: { runId: string; type: HarnessJournalEntryType; step: number; data: Record<string, unknown> },
    generation: number,
    scope: HarnessScope,
  ): HarnessJournalEntry;
  read(runId: string, scope: HarnessScope): HarnessJournalEntry[];
  getCheckpoint(runId: string, scope: HarnessScope): HarnessCheckpoint | null;
  saveCheckpoint(checkpoint: HarnessCheckpoint, generation: number, scope: HarnessScope): void;
}

export interface HarnessModelRequest {
  runId: string;
  modelId: string;
  step: number;
  task: string;
  history: string[];
  tools: HarnessToolDefinition[];
  signal?: AbortSignal;
}

export interface HarnessModelResponse {
  attemptId: string;
  text: string;
  toolCalls: HarnessToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'cancelled';
}

export interface IHarnessInference {
  complete(request: HarnessModelRequest, scope: HarnessScope): Promise<HarnessModelResponse>;
}

export interface HarnessWorkspaceRef {
  repositoryId: string;
  baseRevision: string;
  candidateDigest: string;
  baselineEdits: string[];
}

export interface IHarnessWorkspace {
  prepare(submission: HarnessSubmission, scope: HarnessScope): HarnessWorkspaceRef;
  candidate(submission: HarnessSubmission, scope: HarnessScope): HarnessWorkspaceRef;
  recordAction(actionId: string, result: HarnessToolResult, scope: HarnessScope): void;
  reconcile(actionId: string, scope: HarnessScope): HarnessToolResult | null;
  repair(repositoryId: string, scope: HarnessScope): void;
}

export interface IHarnessVerifier {
  verify(submission: HarnessSubmission, workspace: HarnessWorkspaceRef, scope: HarnessScope): HarnessVerificationResult;
}

export interface IToolRegistry {
  snapshot(): HarnessToolDefinition[];
  resolve(call: HarnessToolCall, scope: HarnessScope): HarnessToolDefinition;
  execute(definition: HarnessToolDefinition, call: HarnessToolCall, actionId: string, scope: HarnessScope): HarnessToolResult;
}

/** Gateway-owned projection of a harness run into the existing public contract. */
export interface IHarnessProjection {
  appendAssistantText(runId: string, messageId: string, delta: string, scope: HarnessScope): Promise<void>;
  publish(type: string, runId: string, data: Record<string, unknown>, scope: HarnessScope): void;
  signal(runId: string, scope: HarnessScope): AbortSignal;
  finish(runId: string, outcome: HarnessOutcome, scope: HarnessScope): Promise<void>;
}
