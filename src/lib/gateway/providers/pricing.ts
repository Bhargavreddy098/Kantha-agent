import type { GatewayConnection } from '../contracts/connection';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';

interface TokenPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

function validRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function gatewayModelPrice(
  connection: GatewayConnection,
  modelId: string,
  ctx: RequestContext
): TokenPrice | undefined {
  const configured = process.env.GATEWAY_MODEL_PRICES;
  if (!configured?.trim()) return undefined;

  const invalidPrices = () => new GatewayError({
    code: 'service_unavailable',
    message: 'Gateway pricing configuration is invalid.',
    requestId: ctx.requestId,
  });

  let raw: unknown;
  try {
    raw = JSON.parse(configured);
  } catch {
    throw invalidPrices();
  }
  if (!isRecord(raw)) throw invalidPrices();

  const prices = new Map<string, TokenPrice>();
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw invalidPrices();
    const { inputPerMillion, outputPerMillion } = value;
    const separator = key.indexOf(':');
    if (separator < 1 || separator === key.length - 1 || !validRate(inputPerMillion) || !validRate(outputPerMillion)) {
      throw invalidPrices();
    }
    prices.set(key, { inputPerMillion, outputPerMillion });
  }

  return prices.get(`${connection.id}:${modelId}`) ?? prices.get(`${connection.providerType}:${modelId}`);
}

export function quoteTokenCost(
  price: TokenPrice | undefined,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  if (!price) return undefined;
  return (price.inputPerMillion * inputTokens + price.outputPerMillion * outputTokens) / 1_000_000;
}
