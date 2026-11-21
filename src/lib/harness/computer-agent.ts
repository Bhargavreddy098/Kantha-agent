export type ComputerAction =
  | { action: 'click'; x: number; y: number }
  | { action: 'type'; text: string }
  | { action: 'key'; key: string };

export type ComputerScreenshot = {
  image: Uint8Array;
  mediaType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
};

export type ComputerDecision =
  | { kind: 'answer'; text: string }
  | { kind: 'action'; input: ComputerAction };

export type ComputerAgentResult = {
  status: 'answered' | 'step_limit';
  text: string;
  actions: ComputerAction['action'][];
};

const MAX_ACTIONS = 5;

export async function runComputerAgent(task: string, signal: AbortSignal, services: {
  observe(signal: AbortSignal): Promise<ComputerScreenshot>;
  decide(input: {
    task: string;
    screenshot: ComputerScreenshot;
    actions: readonly ComputerAction['action'][];
    canAct: boolean;
    signal: AbortSignal;
  }): Promise<ComputerDecision>;
  dispatch(action: ComputerAction, step: number, signal: AbortSignal): Promise<void>;
}): Promise<ComputerAgentResult> {
  const actions: ComputerAction['action'][] = [];
  for (let step = 0; step <= MAX_ACTIONS; step++) {
    signal.throwIfAborted();
    const screenshot = await services.observe(signal);
    const canAct = step < MAX_ACTIONS;
    const decision = await services.decide({ task, screenshot, actions, canAct, signal });
    signal.throwIfAborted();
    if (decision.kind === 'answer') {
      return { status: canAct ? 'answered' : 'step_limit', text: decision.text, actions };
    }
    if (!canAct) break;
    if (decision.input.action === 'click' &&
        (decision.input.x >= screenshot.width || decision.input.y >= screenshot.height)) {
      throw new RangeError('The click is outside the observed screen.');
    }
    await services.dispatch(decision.input, step + 1, signal);
    actions.push(decision.input.action);
  }
  return { status: 'step_limit', text: '', actions };
}
