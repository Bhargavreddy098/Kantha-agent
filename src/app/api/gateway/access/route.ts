import { randomUUID } from 'node:crypto';
import { connection, NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  authenticateGatewayRequest,
  gatewayOrigin,
  grantGatewayAccess,
  requireSameOrigin,
} from '@/lib/gateway/server/access';
import { formatErrorResponse, readGatewayJson } from '@/lib/gateway/server/ingress';
import { createGatewayError } from '@/lib/gateway/contracts/errors';

function accessResponse(member: ReturnType<typeof authenticateGatewayRequest>) {
  return NextResponse.json(
    member
      ? { authenticated: true, workspaceId: member.workspaceId, actorId: member.actorId, roles: [member.role] }
      : { authenticated: false },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    return accessResponse(authenticateGatewayRequest(request));
  } catch (error) {
    return formatErrorResponse(error, randomUUID()).response;
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const body = await readGatewayJson(request, 4096);
    const token = (body as { token?: unknown } | null)?.token;
    if (typeof token !== 'string') {
      throw createGatewayError({ code: 'invalid_request', message: 'Enter a gateway access token.' });
    }
    const session = grantGatewayAccess(token.trim());
    const response = accessResponse(session.member);
    response.cookies.set(ACCESS_COOKIE, session.cookie, {
      httpOnly: true,
      sameSite: 'strict',
      secure: gatewayOrigin(request).protocol === 'https:',
      path: '/',
      maxAge: session.maxAge,
    });
    return response;
  } catch (error) {
    return formatErrorResponse(error, randomUUID()).response;
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const response = accessResponse(undefined);
    response.cookies.set(ACCESS_COOKIE, '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: gatewayOrigin(request).protocol === 'https:',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return formatErrorResponse(error, randomUUID()).response;
  }
}
