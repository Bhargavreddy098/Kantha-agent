import { lookup } from 'node:dns/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createGatewayError } from '../contracts/errors';

const MAX_UPSTREAM_BYTES = 16 * 1024 * 1024;
const DISALLOWED = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) DISALLOWED.addSubnet(address, prefix, 'ipv4');

function endpointError() {
  return createGatewayError({
    code: 'invalid_request',
    field: 'endpoint',
    message: 'Use a public HTTPS provider URL or a private origin explicitly configured by the gateway operator.',
  });
}

function isAllowedPrivateOrigin(url: URL): boolean {
  const configured = (process.env.GATEWAY_PRIVATE_ORIGINS ?? '').split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.some((origin) => origin === url.origin)) {
    return true;
  }
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function checkUrl(url: URL) {
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash ||
      /%2f|%5c/i.test(url.pathname)) {
    throw endpointError();
  }

  const privateOrigin = isAllowedPrivateOrigin(url);
  const hostname = url.hostname.replace(/\.$/, '');
  if (hostname.startsWith('[') ||
      (!privateOrigin && (url.protocol !== 'https:' ||
      (isIP(hostname) === 4 ? DISALLOWED.check(hostname) : !hostname.includes('.') ||
      /\.(localhost|local|internal|test|invalid|home\.arpa)$/i.test(hostname))))) {
    throw endpointError();
  }
}

export function normalizeProviderEndpoint(endpoint: string): string {
  if (endpoint.length > 2048) throw endpointError();
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw endpointError();
  }
  checkUrl(url);
  if (url.search) throw endpointError();

  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:models|chat\/completions)$/, '');
  return url.toString().replace(/\/$/, '');
}

async function resolveAddress(url: URL, signal: AbortSignal): Promise<string> {
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (hostname === 'localhost') return '127.0.0.1';
  if (isIP(hostname) === 4) return hostname;
  const addresses = await lookup(hostname, { family: 4, all: true });
  signal.throwIfAborted();
  if (!addresses.length || (!isAllowedPrivateOrigin(url) && addresses.some(({ address }) => DISALLOWED.check(address)))) {
    throw endpointError();
  }
  return addresses[0].address;
}

async function sendProviderRequest(input: Parameters<typeof fetch>[0], init?: RequestInit, onDispatch?: () => void): Promise<Response> {
  const outbound = new Request(input, init);
  const url = new URL(outbound.url);
  checkUrl(url);
  const signal = AbortSignal.any([outbound.signal, AbortSignal.timeout(60_000)]);
  const address = await resolveAddress(url, signal);
  const body = outbound.body ? Buffer.from(await outbound.arrayBuffer()) : undefined;
  const headers = Object.fromEntries(outbound.headers);
  headers['accept-encoding'] = 'identity';
  delete headers.host;
  delete headers.cookie;
  if (body) headers['content-length'] = String(body.byteLength);
  const send = url.protocol === 'https:' ? requestHttps : requestHttp;

  return new Promise<Response>((resolve, reject) => {
    const request = send(url, {
      method: outbound.method,
      headers,
      agent: false,
      family: 4,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      signal,
    }, (incoming) => {
      const status = incoming.statusCode ?? 502;
      if (status >= 300 && status < 400) {
        incoming.destroy();
        reject(createGatewayError({ code: 'upstream_failed', message: 'Provider redirects are disabled.' }));
        return;
      }

      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) responseHeaders.append(name, item);
        }
      }
      const hasBody = outbound.method !== 'HEAD' && status !== 204 && status !== 205;
      if (!hasBody) {
        incoming.resume();
        resolve(new Response(null, { status, headers: responseHeaders }));
        return;
      }
      const encoding = responseHeaders.get('content-encoding');
      if ((encoding && encoding !== 'identity') ||
          Number(responseHeaders.get('content-length')) > MAX_UPSTREAM_BYTES) {
        incoming.destroy();
        reject(createGatewayError({ code: 'upstream_failed', message: 'Provider response exceeds transport limits.' }));
        return;
      }
      let received = 0;
      const stream = Readable.toWeb(incoming, {
        strategy: { highWaterMark: incoming.readableHighWaterMark, size: (chunk: Uint8Array) => chunk.byteLength },
      }) as ReadableStream<Uint8Array>;
      const body = stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > MAX_UPSTREAM_BYTES) {
            throw createGatewayError({ code: 'upstream_failed', message: 'Provider response exceeds transport limits.' });
          }
          controller.enqueue(chunk);
        },
      }));
      resolve(new Response(body, { status, headers: responseHeaders }));
    });
    request.once('error', reject);
    onDispatch?.();
    request.end(body);
  });
}

export function makeProviderFetch(endpoint: string, onDispatch?: () => void): typeof fetch {
  const base = new URL(normalizeProviderEndpoint(endpoint));
  const prefix = base.pathname.replace(/\/+$/, '');
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== base.origin ||
        (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/'))) {
      throw endpointError();
    }
    return sendProviderRequest(input, init, onDispatch);
  };
}
