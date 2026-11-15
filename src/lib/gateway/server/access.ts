import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { RequestContext } from '../contracts/context';
import { createGatewayError } from '../contracts/errors';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SESSION_LIFETIME = 8 * 60 * 60;
export const ACCESS_COOKIE = 'kantha_gateway_session';

interface WorkspaceMember {
  actorId: string;
  workspaceId: string;
  role: 'owner' | 'member';
  tokenSha256: string;
}

function configurationError() {
  return createGatewayError({
    code: 'service_unavailable',
    message: 'Gateway access is not configured.',
  });
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function members(): WorkspaceMember[] {
  const configured = process.env.GATEWAY_MEMBERS;
  if (configured) {
    let entries: WorkspaceMember[];
    try {
      entries = JSON.parse(configured);
    } catch {
      throw configurationError();
    }

    if (!Array.isArray(entries) || !entries.length || entries.length > 200) {
      throw configurationError();
    }

    for (const entry of entries) {
      if (!entry ||
        typeof entry.actorId !== 'string' || !ID_PATTERN.test(entry.actorId) ||
        typeof entry.workspaceId !== 'string' || !ID_PATTERN.test(entry.workspaceId) ||
        (entry.role !== 'owner' && entry.role !== 'member') ||
        typeof entry.tokenSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.tokenSha256)) {
        throw configurationError();
      }
    }

    if (new Set(entries.map((entry) => entry.tokenSha256)).size !== entries.length) {
      throw configurationError();
    }
    return entries;
  }

  const token =
    process.env.GATEWAY_ACCESS_TOKEN ||
    (process.env.NODE_ENV !== 'production' ? 'kantha-dev-workspace-access-token-32chars' : undefined);
  const workspaceId = process.env.GATEWAY_WORKSPACE_ID ?? 'kantha';
  if (!token || !TOKEN_PATTERN.test(token) || !ID_PATTERN.test(workspaceId)) {
    throw configurationError();
  }

  return [{ actorId: 'owner', workspaceId, role: 'owner', tokenSha256: digest(token) }];
}

function equalHex(first: string, second: string): boolean {
  return timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

export function checkGatewayAccessConfiguration(): void {
  members();
}

function memberForToken(token: string, available: WorkspaceMember[]): WorkspaceMember | undefined {
  if (!TOKEN_PATTERN.test(token)) return;
  const tokenHash = digest(token);
  return available.find((member) => equalHex(member.tokenSha256, tokenHash));
}

function signature(member: WorkspaceMember, text: string): string {
  return createHmac('sha256', Buffer.from(member.tokenSha256, 'hex'))
    .update(JSON.stringify(['kantha-access-v1', member.actorId, member.workspaceId, member.role, text]))
    .digest('hex');
}

function memberForCookie(cookie: string, available: WorkspaceMember[]): WorkspaceMember | undefined {
  const [expires, nonce, proof, extra] = cookie.split('.');
  if (extra !== undefined ||
      !/^\d{10}$/.test(expires ?? '') ||
      !/^[a-f0-9-]{36}$/.test(nonce ?? '') ||
      !/^[a-f0-9]{64}$/.test(proof ?? '') ||
      Number(expires) <= Math.floor(Date.now() / 1000)) {
    return;
  }
  return available.find((member) => equalHex(signature(member, [expires, nonce].join('.')), proof));
}

export function gatewayOrigin(request: Request): URL {
  const origin = new URL(process.env.GATEWAY_ORIGIN || request.url);
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw configurationError();
  }
  return origin;
}

export function requireSameOrigin(request: Request): void {
  const expected = gatewayOrigin(request).origin;
  if (request.headers.get('origin') !== expected) {
    throw createGatewayError({ code: 'forbidden', message: 'This request must come from the gateway origin.' });
  }
}

export function authenticateGatewayRequest(request: NextRequest): WorkspaceMember | undefined {
  const credentials = members();
  const authorization = request.headers.get('authorization');
  if (authorization) {
    const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(authorization);
    return match ? memberForToken(match[1], credentials) : undefined;
  }
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!cookie) return;
  if (request.method !== 'GET' && request.method !== 'HEAD') requireSameOrigin(request);
  return memberForCookie(cookie, credentials);
}

export function grantGatewayAccess(token: string) {
  const member = memberForToken(token, members());
  if (!member) throw createGatewayError({ code: 'unauthorized', message: 'Access token is invalid.' });
  const text = [Math.floor(Date.now() / 1000) + SESSION_LIFETIME, randomUUID()].join('.');
  return { member, cookie: [text, signature(member, text)].join('.'), maxAge: SESSION_LIFETIME };
}

export function requireGatewayOwner(ctx: RequestContext): void {
  if (!ctx.caller.roles?.includes('owner')) {
    throw createGatewayError({ code: 'forbidden', message: 'Workspace owner access is required.', requestId: ctx.requestId });
  }
}
