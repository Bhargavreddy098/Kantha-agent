import { startGatewayChat } from '@/lib/gateway/providers/chat-service';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';

export const maxDuration = 60;

export const POST = withGatewayIngress(async (req, ctx) => {
  const { response } = await startGatewayChat(await readGatewayJson(req), ctx);
  return response;
});
