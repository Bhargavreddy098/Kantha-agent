import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';

const testHost = '127.0.0.1';

async function listen(server) {
  server.listen(0, testHost);
  await once(server, 'listening');
  return 'http://' + testHost + ':' + server.address().port;
}

async function stopServer(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  assert.fail('Timed out waiting for gateway state.');
}

async function startGateway(gatewayOrigin, environment) {
  const child = spawn(process.execPath, [
    'node_modules/next/dist/bin/next', 'start', '--hostname', testHost,
    '--port', new URL(gatewayOrigin).port,
  ], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { output = (output + chunk).slice(-10_000); });
  }
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, 'exit');
    child.kill();
    await ended;
  }
  try {
    await eventually(async () => {
      if (child.exitCode !== null) throw new Error('Gateway exited before readiness:\n' + output);
      const response = await fetch(gatewayOrigin + '/api/gateway/health/ready', {
        signal: AbortSignal.timeout(2_000),
      }).catch(() => null);
      if (response) await response.body?.cancel();
      return response?.ok;
    });
  } catch (error) {
    await stop();
    throw new Error('Gateway did not become ready:\n' + output, { cause: error });
  }
  return { stop };
}

function frame(delta, finishReason, usage) {
  return 'data: ' + JSON.stringify({
    id: 'fixture-chat',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'fixture-model',
    choices: delta ? [{ index: 0, delta, finish_reason: finishReason }] : [],
    ...(usage ? { usage } : {}),
  }) + '\n\n';
}

test('gateway HTTP workflow, tenant boundaries, cancellation and restart', { timeout: 90_000 }, async (t) => {
  const testRoot = join(process.cwd(), '.gateway-fixtures');
  await mkdir(testRoot, { recursive: true });
  const dataDirectory = await mkdtemp(join(testRoot, 'e2e-'));
  const databasePath = join(dataDirectory, 'gateway.sqlite');

  const ownerKey = randomBytes(32).toString('base64url');
  const memberKey = randomBytes(32).toString('base64url');
  const otherKey = randomBytes(32).toString('base64url');
  const providerKey = 'fixture-' + randomBytes(24).toString('hex');
  const requests = [];
  let cancelledUpstream = false;
  let redirectedUpstream = false;

  const upstream = createServer(async (req, res) => {
    if (req.url === '/jump/models') {
      res.writeHead(302, { location: '/redirected' }).end();
      return;
    }
    if (req.url === '/redirected') redirectedUpstream = true;
    if (req.headers.authorization !== 'Bearer ' + providerKey) {
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"invalid fixture credential"}');
      return;
    }
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[{"id":"fixture-model"}]}');
      return;
    }
    if (req.url !== '/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const slow = body.messages.at(-1)?.content === 'wait for cancellation';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(frame({ role: 'assistant', content: slow ? 'Partial output' : 'Fixture reply' }, null));
    if (slow) {
      res.on('close', () => { cancelledUpstream = !res.writableEnded; });
      return;
    }
    res.write(frame({}, 'stop'));
    res.end(frame(null, null, { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 }) + 'data: [DONE]\n\n');
  });
  let gateway;
  t.after(async () => {
    await gateway?.stop();
    await stopServer(upstream);
    for (const suffix of ['', '-shm', '-wal']) await rm(databasePath + suffix, { force: true });
    await rmdir(dataDirectory);
  });
  const providerOrigin = await listen(upstream);
  const reservation = createServer();
  const gatewayOrigin = await listen(reservation);
  await stopServer(reservation);

  const entry = (actorId, workspaceId, role, token) => ({
    actorId, workspaceId, role, tokenSha256: createHash('sha256').update(token).digest('hex'),
  });
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    GATEWAY_DB_PATH: databasePath,
    GATEWAY_SECRET_KEY: randomBytes(32).toString('base64'),
    GATEWAY_ORIGIN: gatewayOrigin,
    GATEWAY_PRIVATE_ORIGINS: providerOrigin,
    GATEWAY_MAX_DAILY_TOKENS: '4000',
    GATEWAY_MAX_DAILY_BUDGET_USD: '1',
    GATEWAY_MODEL_PRICES: JSON.stringify({ 'custom:fixture-model': { inputPerMillion: 2, outputPerMillion: 4 } }),
    GATEWAY_MEMBERS: JSON.stringify([
      entry('operator', 'team', 'owner', ownerKey),
      entry('member', 'team', 'member', memberKey),
      entry('visitor', 'elsewhere', 'owner', otherKey),
    ]),
  };

  gateway = await startGateway(gatewayOrigin, environment);

  let cookie;
  async function request(path, { method = 'GET', body, token, status = 200, browser = true, headers = {} } = {}) {
    const response = await fetch(gatewayOrigin + path, {
      method,
      headers: {
        ...(browser && cookie ? { cookie } : {}),
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        origin: gatewayOrigin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    assert.equal(response.status, status, method + ' ' + path + ' returned ' + response.status);
    return response;
  }
  const json = async (path, options) => (await request(path, options)).json();
  const invoke = async (path, options) => { await (await request(path, options)).body?.cancel(); };

  await invoke('/api/gateway/connections', { status: 401, headers: { 'x-workspace-id': 'team', 'x-actor-id': 'operator' } });
  const login = await request('/api/gateway/access', { method: 'POST', body: { token: ownerKey } });
  const cookieHeader = login.headers.get('set-cookie') ?? '';
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=strict/i);
  assert(!cookieHeader.includes(ownerKey));
  cookie = cookieHeader.split(';')[0];
  assert.equal((await login.json()).workspaceId, 'team');

  const connections = '/api/gateway/connections';
  const create = { label: 'Fixture provider', providerType: 'custom', endpoint: providerOrigin + '/v1', apiKey: providerKey };
  await invoke(connections, { method: 'POST', body: create, headers: { origin: 'http://unrelated.invalid' }, status: 403 });
  await invoke(connections, { token: memberKey, browser: false, status: 403 });
  await invoke(connections, {
    method: 'POST', body: { ...create, endpoint: 'http://localhost:1/v1' }, status: 400,
  });

  const connection = await json(connections, { method: 'POST', body: create, status: 201 });
  assert.equal(connection.hasCredential, true);
  assert(!('secretRef' in connection));
  assert(!JSON.stringify(connection).includes(providerKey));
  const path = connections + '/' + connection.id;
  await invoke(path, { token: otherKey, browser: false, status: 404 });
  assert.deepEqual((await json('/api/models')).models, []);
  assert.equal((await json(path + '/test', { method: 'POST' })).success, true);
  assert.deepEqual((await json(path + '/discover', { method: 'POST' })).models.map(({ id }) => id), ['fixture-model']);
  const catalog = await json('/api/models', { token: memberKey, browser: false });
  assert.equal(catalog.data[0].connectionId, connection.id);
  assert.deepEqual((await json('/api/models', { token: otherKey, browser: false })).models, []);

  const bad = await json(connections, {
    method: 'POST', body: { ...create, label: 'Unverified provider', apiKey: 'wrong-fixture-key' }, status: 201,
  });
  await invoke(connections + '/' + bad.id + '/discover', { method: 'POST', status: 502 });
  const redirect = await json(connections, {
    method: 'POST', body: { ...create, label: 'Redirecting provider', endpoint: providerOrigin + '/jump' }, status: 201,
  });
  await invoke(connections + '/' + redirect.id + '/discover', { method: 'POST', status: 502 });
  assert.equal(redirectedUpstream, false);

  const session = await json('/api/gateway/sessions', { method: 'POST', body: { title: 'E2E conversation' }, status: 201 });
  const sessionPath = '/api/gateway/sessions/' + session.id;
  assert.equal((await json(sessionPath)).run, null);
  await invoke(sessionPath, { token: otherKey, browser: false, status: 404 });

  const chatBody = {
    sessionId: session.id, submissionKey: 'fixture-turn-one',
    connectionId: connection.id, model: 'fixture-model', maxTokens: 256,
    messages: [{ id: 'user-text', role: 'user', parts: [{ type: 'text', text: 'Send this exact text' }] }],
  };
  const chat = await request('/api/chat', { method: 'POST', body: chatBody });
  const runId = chat.headers.get('x-kantha-run-id');
  assert(runId);
  assert.equal(chat.headers.get('x-kantha-session-id'), session.id);
  assert.match(await chat.text(), /Fixture reply/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].messages.at(-1).content, 'Send this exact text');
  const firstUsage = await json('/api/gateway/usage');
  assert(Math.abs(firstUsage.totals.estimatedCostUsd - 0.000034) < 1e-9);
  let snapshot = await json(sessionPath);
  assert.equal(snapshot.run.status, 'completed');
  assert(snapshot.messages.some((message) => message.content === 'Fixture reply'));
  const replay = await request('/api/chat', { method: 'POST', body: chatBody });
  assert.equal(replay.headers.get('x-kantha-run-id'), runId);
  await replay.body?.cancel();
  assert.equal(requests.length, 1);

  const eventPath = '/api/gateway/events?sessionId=' + session.id;
  assert.match(await (await request(eventPath)).text(), /resync\.requested/);
  const eventStream = await request(eventPath + '&cursor=0');
  const reader = eventStream.body.getReader();
  const decoder = new TextDecoder();
  let replayedEvents = '';
  try {
    while (!replayedEvents.includes('run.completed')) {
      const { value, done } = await reader.read();
      assert(!done);
      replayedEvents += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  assert(replayedEvents.includes(runId));

  const pending = await json('/api/gateway/approvals', { method: 'POST', body: { sessionId: session.id }, status: 201 });
  const approvalPath = '/api/gateway/approvals/' + pending.id;
  const decision = { decision: 'approve', actionVersion: pending.actionVersion };
  snapshot = await json(sessionPath);
  assert.equal(snapshot.pendingApproval.id, pending.id);
  assert.equal(snapshot.run.status, 'waiting_for_approval');

  const dataBeforeRestart = await readFile(databasePath);
  assert(!dataBeforeRestart.includes(providerKey));
  await gateway.stop();
  gateway = await startGateway(gatewayOrigin, environment);
  assert.equal((await json(approvalPath)).status, 'waiting');
  assert.equal((await json(approvalPath, { method: 'POST', body: decision })).status, 'approved');
  assert.equal((await json(approvalPath, { method: 'POST', body: decision })).status, 'approved');
  assert((await json(sessionPath)).messages.some((message) => message.content === 'Fixture reply'));

  const running = await request('/api/chat', {
    method: 'POST',
    body: {
      ...chatBody, submissionKey: 'fixture-turn-two',
      messages: [{ id: 'slow-message', role: 'user', parts: [{ type: 'text', text: 'wait for cancellation' }] }],
    },
  });
  const runningId = running.headers.get('x-kantha-run-id');
  await eventually(() => requests.length === 2);
  const cancelled = await json('/api/gateway/runs/' + runningId + '/cancel', { method: 'POST', body: {} });
  assert.equal(cancelled.status, 'cancelled');
  await running.body?.cancel();
  await eventually(() => cancelledUpstream);
  assert.equal((await json(sessionPath)).run.status, 'cancelled');

  const usage = await json('/api/gateway/usage');
  assert(usage.totals.totalRequests >= 1);
  assert(usage.totals.totalTokens >= 13);
  await invoke('/api/chat', {
    method: 'POST',
    body: { ...chatBody, maxTokens: 4096, submissionKey: 'fixture-budget-denial' }, status: 402,
  });
  assert.equal(requests.length, 2);

  await invoke(path, { method: 'DELETE', status: 204 });
  assert.deepEqual((await json('/api/models')).models, []);
});
