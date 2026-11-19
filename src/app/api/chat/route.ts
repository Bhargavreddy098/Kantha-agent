import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';

export const maxDuration = 60;

export const POST = withGatewayIngress(async (req, ctx) => {
  const input = await readGatewayJson(req, 24 * 1024 * 1024);
  return getGatewayRegistry().chatService.streamChat(input, ctx);
});
