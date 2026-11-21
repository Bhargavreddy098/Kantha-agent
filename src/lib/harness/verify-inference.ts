/**
 * H2 inference verification. Exercises the gateway-mediated inference seam,
 * attempt accounting and the sequential tool-batch runner entirely in memory
 * with scripted providers. No network, browser or deployment is required.
 */
import {
  HarnessError,
  type HarnessModelRequest,
  type HarnessModelResponse,
  type HarnessScope,
  type HarnessSubmission,
  type HarnessToolResult,
  type HarnessWorkspaceRef,
  type IHarnessProjection,
  type IHarnessStore,
  type IToolRegistry,
  type NewHarnessEvent,
  type StoredHarnessEvent,
} from './contracts';
import {
  GatewayInference,
  type AttemptReservationInput,
  type AttemptSettlementInput,
  type InferenceChunk,
} from './inference';
import { HarnessJournal } from './journal';
import { HarnessRunner } from './runner';
import { estimateTokens } from './tokens';

const scope: HarnessScope = {
  workspaceId: 'ws_h2',
  actorId: 'usr_h2',
  requestId: 'req_h2',
};

let assertions = 0;
function expect(condition: unknown, message: string): asserts condition {
  assertions += 1;
  if (!condition) throw new Error('H2 assertion failed: ' + message);
}

class MemoryStore implements IHarnessStore {
  private readonly documents = new Map<string, unknown>();
  readonly events: StoredHarnessEvent[] = [];

  private key(collection: string, scopeId: string, id: string) {
    return JSON.stringify([collection, scopeId, id]);
  }
  write<T>(operation: () => T): T { return operation(); }
  get<T>(collection: string, scopeId: string, id: string): T | null {
    return (this.documents.get(this.key(collection, scopeId, id)) as T | undefined) ?? null;
  }
  list<T>(collection: string, scopeId: string): T[] {
    const prefix = JSON.stringify([collection, scopeId]).slice(0, -1);
    return [...this.documents.entries()]
      .filter(([key]) => key.startsWith(prefix))
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

class RecordingLedger {
  allow = true;
  readonly reservations: AttemptReservationInput[] = [];
  readonly settlements: AttemptSettlementInput[] = [];

  async reserve(input: AttemptReservationInput) {
    this.reservations.push(input);
    return this.allow;
  }
  async settle(input: AttemptSettlementInput) {
    this.settlements.push(input);
  }
}

class RecordingProjection implements IHarnessProjection {
  readonly deltas: string[] = [];
  readonly published: string[] = [];
  finished?: { status: string };
  private readonly controller = new AbortController();

  async appendAssistantText(_runId: string, _messageId: string, delta: string) {
    this.deltas.push(delta);
  }
  publish(type: string) {
    this.published.push(type);
  }
  signal() { return this.controller.signal; }
  abort() { this.controller.abort(); }
  async finish(_runId: string, outcome: { status: string }) {
    this.finished = { status: outcome.status };
  }
}

type Dispatcher = (input: unknown, ctx: unknown) => AsyncIterable<InferenceChunk>;

async function* emit(...chunks: InferenceChunk[]): AsyncIterable<InferenceChunk> {
  for (const chunk of chunks) yield chunk;
}

function request(overrides: Partial<HarnessModelRequest> = {}): HarnessModelRequest {
  return {
    runId: 'run_h2',
    modelId: 'model-h2',
    step: 1,
    task: 'Do the fixture task',
    history: ['prior context'],
    tools: [],
    ...overrides,
  };
}

async function assertBudgetRefusal(): Promise<void> {
  const ledger = new RecordingLedger();
  ledger.allow = false;
  let dispatches = 0;
  const inference = new GatewayInference({
    ledger,
    dispatch: async function* () { dispatches += 1; yield { type: 'text', text: 'should not happen' }; },
  });

  let denied = false;
  try {
    await inference.complete(request(), scope);
  } catch (error) {
    denied = error instanceof HarnessError && error.code === 'budget_denied';
  }
  expect(denied, 'budget denial is a typed harness error');
  expect(dispatches === 0, 'budget refusal performs zero upstream dispatches');
  expect(ledger.settlements.length === 0, 'a refused reservation is never settled');
}

async function assertTransientRetry(): Promise<void> {
  const ledger = new RecordingLedger();
  let dispatches = 0;
  const inference = new GatewayInference({
    ledger,
    dispatch: async function* (input) {
      dispatches += 1;
      if (dispatches === 1) throw new Error('pre-output transport failure');
      input.onDispatch();
      yield* emit({ type: 'text', text: 'recovered' }, { type: 'usage', prompt: 5, completion: 3, total: 8 }, { type: 'finish', reason: 'stop' });
    },
  });

  const response = await inference.complete(request(), scope);
  expect(response.text === 'recovered', 'retry produces the recovered output');
  expect(dispatches === 2, 'transient pre-output failure retries once');
  expect(ledger.reservations.length === 2, 'each physical attempt reserves independently');
  expect(ledger.reservations[0].attemptId !== ledger.reservations[1].attemptId, 'attempt ids differ across retries');
  expect(ledger.settlements.length === 2, 'both attempts settle exactly once');
  expect(ledger.settlements[0].status === 'refunded', 'failed pre-output attempt is refunded');
  expect(ledger.settlements[1].status === 'settled', 'successful attempt is settled');
}

async function assertFragmentBuffering(): Promise<void> {
  const ledger = new RecordingLedger();
  const inference = new GatewayInference({
    ledger,
    dispatch: async function* (input) {
      input.onDispatch();
      yield* emit(
        { type: 'tool_call_fragment', id: 'call_1', name: 'repo.read', argumentsFragment: '{"path":' },
        { type: 'tool_call_fragment', id: 'call_1', argumentsFragment: '"a.ts"}' },
        { type: 'tool_call_fragment', id: 'call_2', name: 'repo.read', argumentsFragment: '{"path":"b.ts"' },
        { type: 'tool_call', id: 'call_1', name: 'repo.read', arguments: '' },
        { type: 'finish', reason: 'tool_calls' },
      );
    },
  });

  const response = await inference.complete(request(), scope);
  expect(response.toolCalls.length === 1, 'only the complete call is emitted');
  expect(response.toolCalls[0].id === 'call_1', 'complete call keeps its stable id');
  expect((response.toolCalls[0].arguments as { path?: string }).path === 'a.ts', 'buffered fragments form valid arguments');
  expect(response.finishReason === 'tool_calls', 'finish reason reflects complete calls');
}

async function assertUnknownUsageSettledOnce(): Promise<void> {
  const ledger = new RecordingLedger();
  const inference = new GatewayInference({
    ledger,
    dispatch: async function* (input) {
      input.onDispatch();
      yield { type: 'text', text: 'partial output' };
      throw new Error('worker killed mid-attempt');
    },
  });

  let failed = false;
  try {
    await inference.complete(request(), scope);
  } catch {
    failed = true;
  }
  expect(failed, 'an interrupted attempt surfaces as a failure');
  expect(ledger.settlements.length === 1, 'a killed attempt settles exactly once');
  expect(ledger.settlements[0].status === 'settled', 'a dispatched attempt is settled, not refunded');
  expect(ledger.settlements[0].tokens === undefined, 'unknown usage stays absent for reconciliation');
}

async function assertStopMidStream(): Promise<void> {
  const ledger = new RecordingLedger();
  const controller = new AbortController();
  const inference = new GatewayInference({
    ledger,
    dispatch: async function* (input) {
      input.onDispatch();
      yield { type: 'text', text: 'first' };
      controller.abort();
      yield { type: 'text', text: 'never consumed' };
    },
  });

  const response = await inference.complete(request({ signal: controller.signal }), scope);
  expect(response.finishReason === 'cancelled', 'Stop yields a cancelled finish reason');
  expect(response.text === 'first', 'no post-Stop content is accepted');
  expect(ledger.settlements.length === 1, 'a stopped attempt settles exactly once');
  expect(ledger.settlements[0].status === 'refunded', 'a stopped attempt is refunded');
}

function submission(maxSteps: number): HarnessSubmission {
  return {
    inputId: 'input_h2',
    sessionId: 'ses_h2',
    task: 'Do the fixture task',
    scope: { repositoryId: 'fixture', allowedRoots: ['src/'] },
    pinned: {
      repositoryId: 'fixture',
      baseRevision: 'base',
      agentVersion: 'v1',
      toolVersion: 1,
      modelId: 'model-h2',
      profile: {
        maxSteps,
        maxRepairs: 0,
        maxElapsedMs: 10 * 60_000,
        maxToolOutputBytes: 8_192,
        leaseMs: 15_000,
      },
    },
    acceptance: [{ id: 'one', behavior: 'b', check: 'fixture.check.command', required: true }],
  };
}

interface RunnerFixture {
  journal: HarnessJournal;
  projection: RecordingProjection;
  runner: HarnessRunner;
}

function runnerFixture(inference: {
  complete(req: HarnessModelRequest, scope: HarnessScope): Promise<HarnessModelResponse>;
}, tools?: IToolRegistry): RunnerFixture {
  const store = new MemoryStore();
  const journal = new HarnessJournal(store);
  const projection = new RecordingProjection();
  const ref: HarnessWorkspaceRef = {
    repositoryId: 'fixture', baseRevision: 'base', candidateDigest: 'digest', baselineEdits: [],
  };
  const runner = new HarnessRunner({
    journal,
    inference,
    tools: tools ?? {
      snapshot: () => [],
      resolve: () => { throw new Error('no tools expected'); },
      execute: () => { throw new Error('no tools expected'); },
    },
    workspace: {
      prepare: () => ref, candidate: () => ref, recordAction: () => undefined,
      reconcile: () => null, repair: () => undefined,
    },
    verifier: {
      verify: () => ({
        runId: '', candidateDigest: 'digest', results: [], verdict: 'completed' as const,
        failedCriteria: [], verifiedAt: new Date().toISOString(),
      }),
    },
    projection,
  });
  return { journal, projection, runner };
}

async function assertSequentialBatch(): Promise<void> {
  const dispatched: string[] = [];
  const tools: IToolRegistry = {
    snapshot: () => [],
    resolve: (call) => {
      if (call.name === 'deny') throw new HarnessError('denied', 'Operation denied by scope.');
      return { id: call.id, version: 1, capability: call.name, effect: 'none', inputSchema: { required: [], properties: {} }, timeoutMs: 1_000, maxOutputBytes: 8_192 };
    },
    execute: (_definition, call) => {
      dispatched.push(call.id);
      const result: HarnessToolResult = {
        callId: call.id, actionId: `action_${call.id}`, toolId: call.name, version: 1,
        status: 'completed', content: 'ok',
      };
      return result;
    },
  };
  const inference = {
    complete: async (req: HarnessModelRequest): Promise<HarnessModelResponse> => req.step === 1
      ? {
          attemptId: 'a1',
          text: 'Working',
          toolCalls: [
            { id: 'call_a', name: 'deny', arguments: {} },
            { id: 'call_b', name: 'allow', arguments: {} },
          ],
          finishReason: 'tool_calls',
        }
      : { attemptId: 'a2', text: '', toolCalls: [], finishReason: 'stop' },
  };

  const fixture = runnerFixture(inference, tools);
  fixture.journal.admit(submission(4), 'run_batch', scope);
  const claim = fixture.journal.claim('run_batch', 'owner_h2', 15_000, scope);
  const outcome = await fixture.runner.execute(submission(4), 'run_batch', claim, scope);

  expect(outcome.status === 'failed', 'a denied call fails the run');
  expect(dispatched.length === 0, 'the sibling after a denial is never dispatched');
  const entries = fixture.journal.read('run_batch', scope);
  expect(entries.some((entry) => entry.type === 'tool_batch'), 'the ordered call list is persisted before dispatch');
  const results = entries.filter((entry) => entry.type === 'tool_result');
  expect(results.length === 2, 'both siblings receive a terminal result');
  const skipped = results.find((entry) => entry.data.skipped === true);
  expect(skipped !== undefined, 'the remaining sibling is recorded as skipped');
  expect((skipped?.data.result as HarnessToolResult).callId === 'call_b', 'the skipped result is correlated to its call');
  const checkpoint = fixture.journal.getCheckpoint('run_batch', scope);
  expect(checkpoint?.plannedCalls?.length === 2, 'planned calls survive in the checkpoint');
  expect(fixture.projection.published.includes('harness.message_delta'), 'assistant text publishes a message delta');
}

async function assertStepCap(): Promise<void> {
  const inference = {
    complete: async (req: HarnessModelRequest): Promise<HarnessModelResponse> => ({
      attemptId: `a${req.step}`,
      text: '',
      toolCalls: [],
      finishReason: 'tool_calls',
    }),
  };
  const fixture = runnerFixture(inference);
  fixture.journal.admit(submission(100), 'run_cap', scope);
  const claim = fixture.journal.claim('run_cap', 'owner_h2', 15_000, scope);
  await fixture.runner.execute(submission(100), 'run_cap', claim, scope);
  const checkpoint = fixture.journal.getCheckpoint('run_cap', scope);
  expect(checkpoint?.step === 24, 'logical steps are capped at the v1 bound of 24');
}

async function assertTokenEstimation(): Promise<void> {
  const first = estimateTokens('deterministic token estimate');
  const second = estimateTokens('deterministic token estimate');
  expect(first === second && first > 0, 'token estimation is deterministic and positive');
}

export async function runInferenceVerification(): Promise<{ passed: boolean; testCount: number; errors: string[] }> {
  const errors: string[] = [];
  const cases: Array<[string, () => Promise<void>]> = [
    ['budget refusal', assertBudgetRefusal],
    ['transient retry', assertTransientRetry],
    ['fragment buffering', assertFragmentBuffering],
    ['unknown usage settlement', assertUnknownUsageSettledOnce],
    ['stop mid-stream', assertStopMidStream],
    ['sequential tool batch', assertSequentialBatch],
    ['v1 step cap', assertStepCap],
    ['token estimation', assertTokenEstimation],
  ];
  for (const [name, test] of cases) {
    const before = assertions;
    try {
      await test();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (assertions === before) errors.push(`${name}: no assertions executed`);
  }
  return { passed: errors.length === 0, testCount: assertions, errors };
}
