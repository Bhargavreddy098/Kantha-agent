import { DefaultChatTransport } from 'ai';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';

const testHost = '127.0.0.1';

// E2E: the Next server with a fixture OpenAI-compatible upstream.
// ---------------------------------------------------------------------------

const PROVIDER_KEY = 'fixture-provider-key';
const capturedUpstream = [];

function startFixtureUpstream() {
  let upstreamDisconnected = false;
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'fixture-alpha' }, { id: 'fixture-beta' }, { id: 'text-embedding-3' }] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/messages') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capturedUpstream.push({ ...body, nativeKey: req.headers['x-api-key'], bearer: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const events = [
        { type: 'message_start', message: { id: 'msg_fixture', model: body.model, role: 'assistant', usage: { input_tokens: 10 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Native Anthropic response.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ];
      for (const event of events) res.write('event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n');
      res.end();
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capturedUpstream.push({ model: body.model, messages: body.messages, stream: body.stream });

      const scenario = body.model;
      if (scenario === 'fixture-auth-error') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'invalid fixture credential' } }));
        return;
      }

      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (payload) => {
        if (Array.isArray(payload.choices)) {
          payload.choices = payload.choices.map((c, i) => ({ index: c.index ?? i, ...c }));
        }
        res.write('data: ' + JSON.stringify(payload) + '\n\n');
      };

      const script = [];
      if (scenario === 'fixture-split') {
        // One event deliberately split across two writes with a pause, plus
        // a comment line, to exercise buffering in the relay parser.
        script.push(async () => {
          res.write(': ping\n');
          res.write('data: {"choices":[{"index":0,"delta":{"content":"Hel');
        }, 150, async () => {
          res.write('lo"}}]}\n\n');
          send({ choices: [{ delta: { reasoning_content: 'thinking...' } }] });
        }, 80, async () => {
          send({ choices: [{ delta: { content: ' world' } }] });
        }, 80, async () => {
          send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
          res.write('data: [DONE]\n\n');
        }, 80);
      } else if (scenario === 'fixture-hang') {
        script.push(async () => {
          send({ choices: [{ delta: { content: 'partial' } }] });
        }, 60_000);
      } else {
        // fixture-model and any other scenario: three staggered content
        // chunks, then [DONE].
        script.push(
          async () => send({ choices: [{ delta: { reasoning_content: 'step one' } }] }),
          120,
          async () => send({ choices: [{ delta: { content: 'Hello' } }] }),
          250,
          async () => send({ choices: [{ delta: { content: ' from' } }] }),
          250,
          async () => send({ choices: [{ delta: { content: ' fixture.' } }] }),
          120,
          async () => {
            send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
            res.write('data: [DONE]\n\n');
          },
        );
      }

      let index = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        res.end();
      };
      res.on('close', () => {
        // Fires when the relay (or anything else) disconnects before the
        // script completes; the hang scenario ends here by definition.
        if (!finished) upstreamDisconnected = true;
        finish();
      });
      const run = async () => {
        while (index < script.length) {
          const step = script[index++];
          if (typeof step === 'number') {
            await pause(step);
            continue;
          }
          await step();
        }
        finish();
      };
      void run();
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{}');
  });

  return {
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, testHost, () => resolve('http://' + testHost + ':' + server.address().port));
      }),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    get disconnected() {
      return upstreamDisconnected;
    },
    reset: () => {
      capturedUpstream.length = 0;
      upstreamDisconnected = false;
    },
  };
}

async function readSseFrames(response) {
  const frames = [];
  const times = [];
  const rawChunks = [];
  const started = performance.now();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    rawChunks.push(decoder.decode(value, { stream: true }));
    buffer += rawChunks.at(-1);
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of event.split('\n')) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          frames.push(payload);
          times.push(performance.now() - started);
        }
      }
    }
  }
  return { frames: frames.map((frame) => JSON.parse(frame)), times, raw: rawChunks };
}

async function eventually(check, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (performance.now() > deadline) assert.fail('Timed out waiting for condition.');
    await pause(100);
  }
}

/** Server output is captured globally so failures can include it. */
let serverLog = '';

/** Writes diagnostics immediately so a hung cleanup can never hide a failure. */
function recordDiagnosis(label, error) {
  try {
    appendFileSync(
      join(process.cwd(), '.gateway-fixtures', 'chat-e2e-diagnosis.txt'),
      `\n==== ${label} @ ${new Date().toISOString()} ====\n${error && error.stack ? error.stack : String(error)}\n---- server log ----\n${serverLog}\n`,
      'utf8',
    );
  } catch {
    // Diagnostics are best effort.
  }
}

test('AI SDK chat streams, model catalog and uploads', { timeout: 240_000 }, async (t) => {
  try {
    await runChatRelaySuite(t);
  } catch (error) {
    recordDiagnosis('AI SDK chat streams, model catalog and uploads', error);
    throw error;
  }
});

async function runChatRelaySuite(t) {
  mkdirSync(join(process.cwd(), '.gateway-fixtures'), { recursive: true });
  try { appendFileSync(join(process.cwd(), '.gateway-fixtures', 'chat-e2e-diagnosis.txt'), ''); } catch { /* fresh file below */ }
  const upstream = startFixtureUpstream();
  const upstreamOrigin = await upstream.listen();
  const baseUrl = upstreamOrigin + '/v1';

  const dataDirectory = await mkdtemp(join(process.cwd(), '.gateway-fixtures', 'chat-e2e-'));
  // Cleanup happens in the wrapped hooks below (kill server, close upstream,
  // remove the data directory) - each best effort so one failure cannot hide
  // the test result or wedge the runner.

  const port = await new Promise((resolve) => {
    // Reserve a port by binding and releasing before next start takes it.
    const probe = createServer();
    probe.listen(0, testHost, () => {
      const chosen = probe.address().port;
      probe.close(() => resolve(chosen));
    });
  });
  const origin = `http://${testHost}:${port}`;

  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: testHost,
    UPLOAD_MAX_FILE_SIZE_MB: '2',
    UPLOAD_MAX_TEXT_LENGTH: '1000',
    GATEWAY_DB_PATH: join(dataDirectory, 'gateway.sqlite'),
    GATEWAY_ORIGIN: origin,
    // Gateway sign-in for the provider-connection chat branch scenario.
    GATEWAY_SECRET_KEY: randomBytes(32).toString('base64url'),
    GATEWAY_MEMBERS: JSON.stringify([{
      actorId: 'operator',
      workspaceId: 'team',
      role: 'owner',
      tokenSha256: createHash('sha256').update('gateway-e2e-workspace-token-32chars').digest('hex'),
    }]),
  };
  environment.GATEWAY_PRIVATE_ORIGINS = upstreamOrigin;

  const child = spawn(process.execPath, [
    'node_modules/next/dist/bin/next', 'start', '--hostname', testHost, '--port', String(port),
  ], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-20_000);
      serverLog = output;
    });
  }
  const killChild = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, 'exit');
    if (process.platform === 'win32') {
      // next start may supervise worker processes; kill the whole tree.
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      await Promise.race([ended, pause(10_000)]);
    } else {
      child.kill('SIGKILL');
      await ended;
    }
  };
  // After hooks run in reverse registration order, so register them in the
  // reverse of the desired execution order: the server kill must run first,
  // the upstream close second, and the data-directory removal last - after
  // the server is gone, when the SQLite lock has been released.
  t.after(async () => {
    // Windows can keep the SQLite file locked for a moment after the server
    // dies; a couple of retries keeps cleanup reliable.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await rm(dataDirectory, { recursive: true, force: true });
        return;
      } catch {
        await pause(500);
      }
    }
  });
  t.after(async () => {
    try {
      await upstream.close();
    } catch {
      // Best effort.
    }
  });
  t.after(async () => {
    try {
      await killChild();
    } catch {
      // The runner must never hang on cleanup.
    }
  });

  await eventually(async () => {
    if (child.exitCode !== null) throw new Error('next start exited early:\n' + output);
    const response = await fetch(origin + '/api/gateway/health/ready', { signal: AbortSignal.timeout(3_000) }).catch(() => null);
    if (!response) return false;
    await response.body?.cancel();
    return response.ok;
  }, 60_000);

  const headers = { 'content-type': 'application/json', authorization: 'Bearer gateway-e2e-workspace-token-32chars' };
  const anonymous = await fetch(origin + '/api/chat/models');
  assert.equal(anonymous.status, 401);
  await anonymous.body?.cancel();
  const denied = await fetch(origin + '/api/chat', { method: 'POST' });
  assert.equal(denied.status, 401);
  await denied.body?.cancel();

  const setup = await fetch(origin + '/api/gateway/connections', {
    method: 'POST', headers,
    body: JSON.stringify({
      label: 'Compatible fixture', providerType: 'custom', endpoint: baseUrl, apiKey: PROVIDER_KEY,
      eligibleModels: ['fixture-model', 'fixture-split', 'fixture-hang', 'fixture-auth-error'],
    }),
  });
  assert.equal(setup.status, 201);
  const connection = await setup.json();
  const postChat = (payload, path = '/api/chat') =>
    fetch(origin + path, {
      method: 'POST', headers,
      body: JSON.stringify({ connectionId: connection.id, ...payload }),
    });
  // ---- Incremental streaming ------------------------------------------------
  {
    upstream.reset();
    const response = await postChat({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'hello fixture' }],
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const { frames, times } = await readSseFrames(response);

    const text = frames.filter((frame) => frame.type === 'text-delta');
    assert.deepEqual(text.map((frame) => frame.delta), ['Hello', ' from', ' fixture.']);
    assert.equal(frames.find((frame) => frame.type === 'reasoning-delta')?.delta, 'step one');
    assert.equal(frames.at(-1).type, 'finish');
    const textTimes = times.filter((_, index) => frames[index].type === 'text-delta');
    assert.ok(textTimes.at(-1) - textTimes[0] > 100, 'text arrived as a single burst');
    assert.equal(capturedUpstream[0].stream, true);
    assert.equal(capturedUpstream[0].messages[0].content, 'hello fixture');
  }

  // ---- Split events, reasoning relay and the [DONE] sentinel -----------------
  {
    upstream.reset();
    const response = await postChat({
      model: 'fixture-split',
      messages: [{ role: 'user', content: 'split test' }],
    });
    const { frames } = await readSseFrames(response);
    assert.deepEqual(frames.filter((frame) => frame.type === 'text-delta').map((frame) => frame.delta), ['Hello', ' world']);
    assert.equal(frames.find((frame) => frame.type === 'reasoning-delta')?.delta, 'thinking...');
    assert.equal(frames.at(-1).type, 'finish');

  }

  // ---- Multimodal pass-through ----------------------------------------------
  {
    upstream.reset();
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const response = await postChat({
      model: 'fixture-model',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'describe this' }, { type: 'image_url', image_url: { url: tinyPng } }] },
      ],
    });
    const { frames } = await readSseFrames(response);
    assert.equal(frames.at(-1).type, 'finish');
    assert.equal(capturedUpstream[0].messages[0].content[0].type, 'text');
    assert.equal(capturedUpstream[0].messages[0].content[1].image_url.url, tinyPng);
  }

  // ---- Request validation ----------------------------------------------------
  {
    const badRole = await postChat({ model: 'fixture-model', messages: [{ role: 'tool', content: 'x' }] });
    assert.equal(badRole.status, 400);
    await badRole.body?.cancel();

    const tooManyImages = await postChat({
      model: 'fixture-model',
      messages: [{
        role: 'user',
        content: Array.from({ length: 7 }, () => ({
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
        })),
      }],
    });
    assert.equal(tooManyImages.status, 400);
    await tooManyImages.body?.cancel();

    const badImage = await postChat({
      model: 'fixture-model',
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:text/html;base64,PGI+' } }] }],
    });
    assert.equal(badImage.status, 400);
    await badImage.body?.cancel();

    const tooLong = await postChat({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'x'.repeat(300_001) }],
    });
    assert.equal(tooLong.status, 400);
    await tooLong.body?.cancel();
  }

  // ---- Upstream credential failure surfaces as an SSE error frame ------------
  {
    upstream.reset();
    const response = await postChat({
      model: 'fixture-auth-error',
      messages: [{ role: 'user', content: 'who are you' }],
    });
    const { frames } = await readSseFrames(response);
    assert.match(frames.find((frame) => frame.type === 'error')?.errorText, /credential/);
    assert.ok(!JSON.stringify(frames).includes('invalid fixture credential'));
  }

  // ---- Model catalog ----------------------------------------------------------
  {
    const response = await fetch(origin + '/api/chat/models', { headers });
    assert.equal(response.status, 200);
    const catalog = await response.json();
    assert.equal(catalog.source, 'connections');
    assert.ok(catalog.data.some((model) => model.id === 'fixture-model' && model.connectionId === connection.id));
    assert.equal(catalog.defaultModel, 'fixture-model');
    assert.ok(!JSON.stringify(catalog).includes(PROVIDER_KEY), 'provider key must never be exposed');
  }

  // ---- Abort propagation ------------------------------------------------------
  {
    upstream.reset();
    const response = await postChat(
      { model: 'fixture-hang', messages: [{ role: 'user', content: 'hang test' }] },
      '/api/v1/chat/completions',
    );
    const reader = response.body.getReader();
    await reader.read(); // First chunk arrives; upstream then stalls.
    await pause(200);
    const runId = response.headers.get('x-kantha-run-id');
    assert.ok(runId);
    const cancel = await fetch(origin + '/api/gateway/runs/' + runId + '/cancel', { method: 'POST', headers });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).status, 'cancelled');
    await reader.cancel();
    await eventually(() => upstream.disconnected, 10_000);
    assert.ok(upstream.disconnected, 'upstream was not cancelled after gateway Stop');
  }

  // A different provider must use its native protocol and still reach the SDK UI stream.
  {
    const model = 'claude-sonnet-4-5';
    const setup = await fetch(origin + '/api/gateway/connections', {
      method: 'POST', headers,
      body: JSON.stringify({ label: 'Native fixture', providerType: 'anthropic', endpoint: baseUrl, apiKey: PROVIDER_KEY, eligibleModels: [model] }),
    });
    assert.equal(setup.status, 201);
    const native = await setup.json();
    upstream.reset();
    const response = await postChat({ model, connectionId: native.id, messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    assert.equal(response.status, 200);
    const { frames } = await readSseFrames(response);
    assert.equal(frames.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta).join(''), 'Native Anthropic response.', JSON.stringify(frames));
    assert.equal(capturedUpstream[0].nativeKey, PROVIDER_KEY);
    assert.equal(capturedUpstream[0].bearer, undefined);
    const snapshot = await fetch(origin + '/api/gateway/sessions/' + response.headers.get('x-kantha-session-id'), { headers });
    assert.equal((await snapshot.json()).run.status, 'completed');
    const transport = new DefaultChatTransport({ api: origin + '/api/chat', headers });
    const stream = await transport.sendMessages({
      trigger: 'submit-message', chatId: 'fixture-ui',
      body: { model, connectionId: native.id, sessionId: response.headers.get('x-kantha-session-id') },
      messages: [{ id: 'fixture-followup', role: 'user', parts: [{ type: 'text', text: 'Follow-up' }] }],
    });
    const deltas = [];
    for await (const chunk of stream) if (chunk.type === 'text-delta') deltas.push(chunk.delta);
    assert.equal(deltas.join(''), 'Native Anthropic response.');
    assert.deepEqual(capturedUpstream[1].messages.map(({ role }) => role), ['user', 'assistant', 'user']);

  }

  // ---- Uploads ----------------------------------------------------------------
  {
    const text = 'BT /F1 12 Tf 20 20 Td (Worker fixture) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => {
      const offset = pdf.length;
      pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
      return offset.toString().padStart(10, '0') + ' 00000 n \n';
    });
    const xref = pdf.length;
    pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('');
    pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const form = new FormData();
    form.append('file', new File([pdf], 'worker.pdf', { type: 'application/pdf' }));
    const response = await fetch(origin + '/api/upload', { method: 'POST', body: form });
    const payload = await response.json();
    assert.equal(response.status, 200, payload.error);
    assert.match(payload.textContent, /Worker fixture/);
  }

  const upload = (form) => fetch(origin + '/api/upload', { method: 'POST', body: form });

  {
    const response = await fetch(origin + '/api/upload');
    assert.match(response.headers.get('cache-control') ?? '', /public, max-age=60/);
    const limits = await response.json();
    assert.equal(limits.maxFileSizeMb, 2);
    assert.equal(limits.maxTextLength, 1000);
  }
  {
    const form = new FormData();
    form.append('file', new File(['hello fixture upload'], 'note.txt', { type: 'text/plain' }));
    const response = await upload(form);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.textContent, 'hello fixture upload');
  }
  {
    const form = new FormData();
    form.append('file', new File(['binary'], 'tool.exe', { type: 'application/octet-stream' }));
    const response = await upload(form);
    assert.equal(response.status, 400);
  }
  {
    const form = new FormData();
    form.append('file', new File(['x'.repeat(3 * 1024 * 1024)], 'big.txt', { type: 'text/plain' }));
    const response = await upload(form);
    assert.equal(response.status, 400);
  }
  {
    const form = new FormData();
    form.append('file', new File(['a'.repeat(1200)], 'long.txt', { type: 'text/plain' }));
    const response = await upload(form);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.truncated, true);
    assert.match(payload.textContent, /\[\.\.\. truncated/);
  }
  {
    // A broken PDF must fail honestly, not scrape binary junk.
    const form = new FormData();
    form.append('file', new File([Buffer.from('%PDF-1.4\nthis is not a real pdf')], 'broken.pdf', { type: 'application/pdf' }));
    const response = await upload(form);
    assert.equal(response.status, 422);
  }
  {
    const form = new FormData();
    form.append('file', new File([Buffer.from('')], 'empty.txt', { type: 'text/plain' }));
    const response = await upload(form);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.textContent, undefined);
  }

  // ---- Provider connections from Settings, used by the gateway chat branch ----
  // The picker in Chat lists the workspace catalog from /api/models; a
  // selected model carries its connectionId so startGatewayChat pins the
  // connection, and the gateway branch streams AI SDK UI-message chunks.
  {
    const gatewayToken = 'gateway-e2e-workspace-token-32chars';
    const login = await fetch(origin + '/api/gateway/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ token: gatewayToken }),
    });
    assert.equal(login.status, 200, 'gateway sign-in failed');
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    assert.match(cookie, /^kantha_gateway_session=/);

    // The workspace catalog stays behind authentication.
    const anon = await fetch(origin + '/api/models');
    assert.equal(anon.status, 401);
    await anon.body?.cancel();

    const connections = await fetch(origin + '/api/gateway/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify({ label: 'Fixture provider', providerType: 'custom', endpoint: baseUrl, apiKey: PROVIDER_KEY }),
    });
    assert.equal(connections.status, 201);
    const connection = await connections.json();
    assert.ok(connection.id, 'connection id missing: ' + JSON.stringify(connection));
    assert(!JSON.stringify(connection).includes(PROVIDER_KEY), 'provider key must never be echoed back');

    const discover = await fetch(origin + '/api/gateway/connections/' + connection.id + '/discover', {
      method: 'POST',
      headers: { origin, cookie },
    });
    assert.equal(discover.status, 200);
    const discovered = await discover.json();
    assert.deepEqual(
      discovered.models.map((model) => model.id).sort(),
      ['fixture-alpha', 'fixture-beta', 'text-embedding-3'],
    );

    // The chat picker's data source lists the connection's models.
    const catalog = await (await fetch(origin + '/api/models', { headers: { origin, cookie } })).json();
    const pickerEntry = (catalog.data ?? []).find((model) => model.id === 'fixture-alpha');
    assert.equal(pickerEntry?.connectionId, connection.id);

    // Chat through the gateway branch with the connection-pinned model.
    upstream.reset();
    const chat = await fetch(origin + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify({
        model: 'fixture-alpha',
        connectionId: connection.id,
        messages: [{ role: 'user', content: 'hello gateway' }],
      }),
    });
    assert.equal(chat.status, 200, 'gateway chat failed');
    assert.match(chat.headers.get('content-type') ?? '', /text\/event-stream/);
    const { frames } = await readSseFrames(chat);
    const chunks = frames.filter((frame) => frame && typeof frame === 'object' && typeof frame.type === 'string');
    const streamedText = chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta).join('');
    assert.equal(streamedText, 'Hello from fixture.', 'chunks: ' + JSON.stringify(frames));
    assert.ok(chunks.some((chunk) => chunk.type === 'finish'), 'UI stream should finish');
    assert.ok(!chunks.some((chunk) => chunk.type === 'error'), 'No error chunk expected: ' + JSON.stringify(chunks));
    // The provider request must carry exactly the model selected in chat.
    const last = capturedUpstream[capturedUpstream.length - 1];
    assert.equal(last.model, 'fixture-alpha');
    assert.equal(last.stream, true);
  }
}
