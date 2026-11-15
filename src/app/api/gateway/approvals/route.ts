import { NextResponse } from 'next/server';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { createGatewayError } from '@/lib/gateway/contracts/errors';

export const GET = withGatewayIngress(async (_req, ctx) => {
  const approvals = await getGatewayRegistry().approvalService.listApprovals(ctx);
  return NextResponse.json({ approvals, total: approvals.length });
});

export const POST = withGatewayIngress(async (req, ctx) => {
  const body = await readGatewayJson(req, 4096);
  const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    throw createGatewayError({ code: 'invalid_request', field: 'sessionId', message: 'A valid session is required.' });
  }
  const approval = await getGatewayRegistry().runService.createInertApproval(sessionId, ctx);
  return NextResponse.json(approval, { status: 201 });
});
