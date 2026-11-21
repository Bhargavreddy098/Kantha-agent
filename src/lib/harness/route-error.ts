import { GatewayError, type GatewayErrorCode } from '../gateway/contracts/errors';
import { HarnessError } from './contracts';

const codeMap: Record<HarnessError['code'], GatewayErrorCode> = {
  invalid_submission: 'invalid_request',
  conflict: 'conflict',
  not_found: 'not_found',
  stale_claim: 'conflict',
  invalid_tool_call: 'invalid_request',
  denied: 'forbidden',
  budget_denied: 'budget_exceeded',
  unresolved: 'conflict',
};

/** Translate harness typed failures into the gateway HTTP error contract. */
export function harnessRouteError(error: unknown, requestId: string): GatewayError {
  if (error instanceof HarnessError) {
    return new GatewayError({
      code: codeMap[error.code] ?? 'internal_error',
      message: error.message,
      requestId,
    });
  }
  return error instanceof GatewayError
    ? error
    : new GatewayError({ code: 'internal_error', message: 'An internal harness error occurred.', requestId });
}
