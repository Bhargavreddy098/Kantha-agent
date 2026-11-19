import type { ModelMessage } from 'ai';
import type { UIMessage } from '../contracts/chat';

export function buildChatPrompt(transcript: readonly UIMessage[], system?: string) {
  // Keep up to six recent images in the model context as the session grows.
  let remainingImages = 6;
  let estimatedInputTokens = 32 + Buffer.byteLength(system ?? '');
  const messages = [...transcript].reverse().flatMap((message): ModelMessage[] => {
    estimatedInputTokens += 16 + Buffer.byteLength(message.content);
    if (message.role === 'assistant') {
      return message.content ? [{ role: 'assistant', content: message.content }] : [];
    }
    if (message.role !== 'user') return [];
    const images = (message.parts ?? []).filter((part) => part.type === 'file' && typeof part.url === 'string')
      .slice(0, remainingImages);
    remainingImages -= images.length;
    if (!images.length) return message.content ? [{ role: 'user', content: message.content }] : [];
    return [{
      role: 'user',
      content: [
        ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
        ...images.map(({ url }) => {
          const [prefix, base64] = (url as string).split(',', 2);
          const image = Buffer.from(base64, 'base64');
          // Use a conservative byte-based estimate for image admission.
          estimatedInputTokens += image.byteLength;
          return { type: 'image' as const, image, mediaType: prefix.slice(5, -7) };
        }),
      ],
    }];
  }).reverse();
  return { messages, estimatedInputTokens };
}
