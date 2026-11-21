import type { ComputerAction, ComputerScreenshot } from '../../harness/computer-agent';
import { makeProviderFetch } from './egress';

const ORGO_API = 'https://www.orgo.ai/api';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function createOrgoComputer(computerId: string, apiKey: string, transport = makeProviderFetch(ORGO_API)) {
  const endpoint = `${ORGO_API}/computers/${encodeURIComponent(computerId)}`;

  async function request(path: string, signal: AbortSignal, body?: object): Promise<unknown> {
    const response = await transport(`${endpoint}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        ...(body && { 'content-type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Orgo rejected the computer request.');
    }
    return response.json();
  }

  return {
    async observe(signal: AbortSignal): Promise<ComputerScreenshot> {
      const data = await request('screenshot?response_format=base64&format=jpeg&quality=55', signal);
      if (typeof data !== 'object' || data === null) throw new Error('Invalid Orgo screenshot.');
      const { success, image, mime_type: mediaType, width, height } = data as Record<string, unknown>;
      if (success !== true || typeof image !== 'string' ||
          image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image) ||
          (mediaType !== 'image/jpeg' && mediaType !== 'image/png') ||
          typeof width !== 'number' || typeof height !== 'number' ||
          !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
          width < 1 || height < 1 || width > 4096 || height > 4096) {
        throw new Error('Invalid Orgo screenshot.');
      }
      const bytes = Buffer.from(image, 'base64');
      if (bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== image) {
        throw new Error('Invalid Orgo screenshot.');
      }
      return { image: bytes, mediaType, width, height };
    },

    async act({ action, ...body }: ComputerAction, signal: AbortSignal): Promise<void> {
      const result = await request(action, signal, body);
      if (typeof result !== 'object' || result === null ||
          !(('success' in result && result.success === true) || ('ok' in result && result.ok === true))) {
        throw new Error('Orgo did not confirm the desktop action.');
      }
    },
  };
}
