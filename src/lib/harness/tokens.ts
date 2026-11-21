import { getEncoding, type Tiktoken } from 'js-tiktoken';

/**
 * Deterministic, offline token estimation. Tokenizer loading is lazy and the
 * encoding is fixed so reservations are reproducible across workers. A simple
 * character estimate is used only if the bundled encoder cannot be loaded.
 */
let encoder: Tiktoken | undefined;

function encoding(): Tiktoken | undefined {
  if (encoder) return encoder;
  try {
    encoder = getEncoding('cl100k_base');
    return encoder;
  } catch {
    return undefined;
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const codec = encoding();
  if (!codec) return Math.ceil(text.length / 4);
  try {
    return codec.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Conservative reservation for one model step: prompt plus history plus a
 * fixed output/reasoning allowance, so an attempt never dispatches unreserved.
 */
export function estimateRequestTokens(input: {
  task: string;
  history: string[];
  tools: unknown[];
  outputReserve?: number;
}): number {
  const serialized = JSON.stringify({
    task: input.task,
    history: input.history,
    tools: input.tools,
  });
  return estimateTokens(serialized) + (input.outputReserve ?? 2_048);
}
