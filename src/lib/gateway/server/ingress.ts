import { randomUUID } from 'node:crypto';
import { connection, NextRequest, NextResponse } from 'next/server';
import { GATEWAY_HEADERS, type RequestContext } from '../contracts/context';
import { createGatewayError, GatewayError, type GatewayErrorEnvelope } from '../contracts/errors';
import { authenticateGatewayRequest } from './access';
import { gatewayLifecycle } from './registry';

export { requireGatewayOwner } from './access';

export function extractRequestContext(req: NextRequest, requestId = randomUUID()): RequestContext {
  const member = authenticateGatewayRequest(req);
  if (!member) {
    throw createGatewayError({ code: 'unauthorized', message: 'Gateway access is required.', requestId });
  }

  return {
    requestId,
    workspaceId: member.workspaceId,
    caller: { type: 'user', id: member.actorId, roles: [member.role] },
    timestamp: Date.now(),
  };
}

export async function readGatewayJson(req: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  const bodyType = req.headers.get('content-type');
  if (bodyType && bodyType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw createGatewayError({ code: 'invalid_request', message: 'Expected an application/json body.', statusCode: 415 });
  }
  if (Number(req.headers.get('content-length')) > maxBytes) {
    throw createGatewayError({ code: 'invalid_request', message: 'Request body is too large.', statusCode: 413 });
  }
  if (!req.body) return null;

  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw createGatewayError({ code: 'invalid_request', message: 'Request body is too large.', statusCode: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body.trim() ? JSON.parse(body) : null;
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw createGatewayError({ code: 'invalid_request', message: 'Request body contains invalid JSON.' });
  } finally {
    reader.releaseLock();
  }
}

export function formatErrorResponse(
  error: unknown,
  requestId: string,
): { response: NextResponse; envelope: GatewayErrorEnvelope } {
  const isGwError = error instanceof GatewayError;
  const failure = isGwError
    ? (error as GatewayError)
    : createGatewayError({ code: 'internal_error', message: 'An internal gateway error occurred.' });
  if (!isGwError) {
    console.error('Gateway request failed', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
  }
  const { code, message, field, retryAfterSeconds } = failure;
  const envelope: GatewayErrorEnvelope = {
    code,
    message,
    requestId,
    ...(field ? { field } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
  const headers: Record<string, string> = {
    [GATEWAY_HEADERS.REQUEST_ID]: requestId,
    'cache-control': 'no-store',
  };
  if (retryAfterSeconds !== undefined) headers['retry-after'] = String(retryAfterSeconds);
  return {
    response: NextResponse.json(envelope, { status: failure.statusCode, headers }),
    envelope,
  };
}

export function withGatewayIngress<TParams extends Record<string, string> = Record<string, string>>(
  handler: (req: NextRequest, ctx: RequestContext, params: TParams) => Promise<Response>,
  options?: { skipReadinessCheck?: boolean },
) {
  return async (req: NextRequest, context: { params: Promise<TParams> }): Promise<Response> => {
    await connection();
    const requestId = randomUUID();
    try {
      const ctx = extractRequestContext(req, requestId);
      if (!options?.skipReadinessCheck) gatewayLifecycle.ensureReady();
      const resolvedParams = (await context?.params ?? {}) as TParams;
      const response = await handler(req, ctx, resolvedParams);
      response.headers.set(GATEWAY_HEADERS.REQUEST_ID, requestId);
      if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
      return response;
    } catch (error) {
      return formatErrorResponse(error, requestId).response;
    }
  };
}
