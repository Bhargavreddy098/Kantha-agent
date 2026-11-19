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

function isLoopback(req: NextRequest): boolean {
  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0];
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  );
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const member = authenticateGatewayRequest(request);
    if (member) {
      return accessResponse(member);
    }

    const explicitlySignedOut =
      request.cookies.get('kantha_signed_out')?.value === 'true' ||
      request.headers.get('x-kantha-signed-out') === 'true';

    const isDevEnvironment =
      process.env.NODE_ENV !== 'production' ||
      process.env.GATEWAY_ACCESS_TOKEN === 'kantha-dev-workspace-access-token-32chars' ||
      process.env.GATEWAY_AUTO_AUTH === 'true';

    const isLoopbackRequest = !process.env.GATEWAY_MEMBERS && isLoopback(request);

    if (isDevEnvironment && isLoopbackRequest && !explicitlySignedOut) {
      const devToken =
        process.env.GATEWAY_ACCESS_TOKEN || 'kantha-dev-workspace-access-token-32chars';
      try {
        const session = grantGatewayAccess(devToken);
        const response = accessResponse(session.member);
        response.cookies.set(ACCESS_COOKIE, session.cookie, {
          httpOnly: true,
          sameSite: 'strict',
          secure: gatewayOrigin(request).protocol === 'https:',
          path: '/',
          maxAge: session.maxAge,
        });
        return response;
      } catch {
        // Fall back to unauthenticated response
      }
    }

    return accessResponse(undefined);
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
    response.cookies.set('kantha_signed_out', '', {
      httpOnly: false,
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
    response.cookies.set('kantha_signed_out', 'true', {
      httpOnly: false,
      sameSite: 'strict',
      secure: gatewayOrigin(request).protocol === 'https:',
      path: '/',
      maxAge: 300,
    });
    return response;
  } catch (error) {
    return formatErrorResponse(error, randomUUID()).response;
  }
}
