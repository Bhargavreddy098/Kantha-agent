import { NextResponse } from 'next/server';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { validateResolveApprovalInput } from '@/lib/gateway/contracts/validation';
import { createGatewayError, GatewayError } from '@/lib/gateway/contracts/errors';

export const GET = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  const approval = await getGatewayRegistry().approvalService.getApprovalById(id, ctx);
  if (!approval) throw createGatewayError({ code: 'not_found', message: 'Approval was not found.' });
  return NextResponse.json(approval);
});

export const POST = withGatewayIngress<{ id: string }>(async (req, ctx, { id }) => {
  const validated = validateResolveApprovalInput(await readGatewayJson(req, 4096), ctx.requestId);
  if (!validated.ok) throw new GatewayError(validated.error);
  const approval = await getGatewayRegistry().approvalService.resolveApproval(id, validated.data, ctx);
  return NextResponse.json(approval);
});
