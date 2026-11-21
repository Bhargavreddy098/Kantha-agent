import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createOrgoComputer } from '../src/lib/gateway/providers/orgo-computer.ts';
import { GatewayComputerAgentService } from '../src/lib/gateway/server/computer-agent-service.ts';
import { GatewayDatabase } from '../src/lib/gateway/server/storage/database.ts';
import { GatewayUsageService } from '../src/lib/gateway/server/usage-service.ts';

const workspaceId = 'computer-test';
const computerId = randomUUID();
const context = {
  workspaceId, requestId: 'computer-request', timestamp: Date.now(),
  caller: { type: 'user', id: 'owner', roles: ['owner'] },
};
const screenshot = {
  image: Buffer.from([255, 216, 255, 217]), mediaType: 'image/jpeg', width: 640, height: 480,
};

test('Orgo inline screenshots and documented action acknowledgements', async () => {
  const calls = [];
  const computer = createOrgoComputer(computerId, 'fixture', async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json(options.method === 'GET' ? {
      success: true, image: screenshot.image.toString('base64'), mime_type: 'image/jpeg', width: 640, height: 480,
    } : { ok: true });
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await computer.observe(signal), screenshot);
  await computer.act({ action: 'click', x: 20, y: 40 }, signal);
  assert.equal(calls[0].url.searchParams.get('response_format'), 'base64');
  assert.equal(calls[0].options.headers.authorization, 'Bearer fixture');
  assert.equal(calls[1].url.pathname, `/api/computers/${computerId}/click`);
  assert.deepEqual(JSON.parse(calls[1].options.body), { x: 20, y: 40 });
});

test('computer runs authorize, account, journal before dispatch, and avoid replay', async (t) => {
  const settings = {
    GATEWAY_ORGO_COMPUTER_ID: computerId, GATEWAY_ORGO_WORKSPACE_ID: workspaceId,
    GATEWAY_ORGO_ACTOR_ID: 'owner', ORGO_API_KEY: 'fixture',
    GATEWAY_MAX_DAILY_TOKENS: '200000', GATEWAY_MAX_DAILY_BUDGET_USD: '',
  };
  for (const [name, value] of Object.entries(settings)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }

  let modelCalls = 0;
  let observed = 0;
  let actCalls = 0;
  let denyBudget = false;
  let rejectAction = false;
  let reservationCount = 0;
  const provider = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const prompt = JSON.parse(body);
    assert.equal(req.url, '/v1/chat/completions');
    assert.ok(prompt.messages.some((message) => Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url')));
    assert.ok(reservationCount > modelCalls, 'a budget reservation precedes provider dispatch');
    modelCalls++;
    const click = actCalls === 0 || rejectAction;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'computer-completion', object: 'chat.completion', model: 'vision',
      choices: [{
        index: 0, finish_reason: click ? 'tool_calls' : 'stop',
        message: click ? {
          role: 'assistant', content: null, tool_calls: [{
            id: 'call_1', type: 'function', function: {
              name: 'computer', arguments: JSON.stringify({ action: 'click', x: 20, y: 40 }),
            },
          }],
        } : { role: 'assistant', content: 'The dialog is open.' },
      }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  const db = new GatewayDatabase(':memory:');
  t.after(() => db.close());
  const usage = new GatewayUsageService(db);
  const connection = {
    id: 'test-connection', status: 'active', providerType: 'openai', eligibleModels: ['vision'],
    endpoint: `http://127.0.0.1:${provider.address().port}/v1`,
  };
  const input = { runId: randomUUID(), task: 'Open the dialog.', connectionId: connection.id, modelId: 'vision' };
  let expectedActionRunId = input.runId;
  const service = new GatewayComputerAgentService({
    db, connections: { getConnection: async () => connection }, secrets: { getSecret: async () => null },
    capacity: { acquire: () => () => {} },
    usage: {
      async reserveAttempt(data, ctx) {
        if (denyBudget) return false;
        reservationCount++;
        return usage.reserveAttempt(data, ctx);
      },
      settleAttempt: usage.settleAttempt.bind(usage),
    },
    computerFactory: () => ({
      async observe() {
        observed++;
        return screenshot;
      },
      async act(actionInput) {
        const action = db.get('computer_actions', workspaceId, `action_${expectedActionRunId}_1`);
        assert.equal(action?.status, 'dispatching');
        assert.equal(actionInput.action, action.kind);
        actCalls++;
        await assert.rejects(service.run({ ...input, runId: randomUUID() }, context, signal), { code: 'conflict' });
        if (rejectAction) throw new Error('Connection lost after dispatch');
      },
    }),
  });
  const signal = new AbortController().signal;
  await assert.rejects(service.run(input, { ...context, workspaceId: 'another' }, signal), { code: 'forbidden' });
  assert.equal(observed, 0);
  assert.deepEqual(await service.run(input, context, signal), {
    runId: input.runId, status: 'answered', text: 'The dialog is open.', actions: ['click'],
  });
  assert.equal(observed, 2);
  assert.equal(modelCalls, 2);
  assert.equal((await usage.getUsage(context)).totals.totalRequests, 2);
  assert.equal(db.get('computer_actions', workspaceId, `action_${input.runId}_1`).status, 'completed');
  await assert.rejects(service.run(input, context, signal), { code: 'conflict' });

  denyBudget = true;
  await assert.rejects(service.run({ ...input, runId: randomUUID() }, context, signal), { code: 'budget_exceeded' });
  assert.equal(modelCalls, 2);
  assert.equal(actCalls, 1);

  denyBudget = false;
  rejectAction = true;
  expectedActionRunId = randomUUID();
  const failing = { ...input, runId: expectedActionRunId };
  await assert.rejects(service.run(failing, context, signal), { code: 'upstream_failed' });
  assert.equal(db.get('computer_actions', workspaceId, `action_${failing.runId}_1`).status, 'unknown');
  await assert.rejects(service.run(failing, context, signal), { code: 'conflict' });
  assert.equal(modelCalls, 3);
  assert.equal(actCalls, 2);
});
