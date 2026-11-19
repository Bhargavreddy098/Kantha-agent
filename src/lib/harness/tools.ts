import { createHash } from 'node:crypto';
import {
  HarnessError,
  type HarnessScope,
  type HarnessToolCall,
  type HarnessToolDefinition,
  type HarnessToolResult,
  type IToolRegistry,
} from './contracts';

/**
 * The first harness tool is inert: it produces a bounded, reproducible result
 * and no side effects. Real repository capabilities (H3) implement the same
 * definition/resolve/execute contract behind a qualified executor.
 */
const inertDefinition: HarnessToolDefinition = {
  id: 'fixture.inert',
  version: 1,
  capability: 'fixture.inert',
  effect: 'none',
  inputSchema: {
    required: ['probe'],
    properties: { probe: 'string', expect: 'string' },
  },
  timeoutMs: 5_000,
  maxOutputBytes: 8_192,
};

export class HarnessToolRegistry implements IToolRegistry {
  private readonly definitions: HarnessToolDefinition[] = [inertDefinition];

  snapshot(): HarnessToolDefinition[] {
    return this.definitions.map((definition) => structuredClone(definition));
  }

  resolve(call: HarnessToolCall, scope: HarnessScope): HarnessToolDefinition {
    void scope;
    const definition = this.definitions.find((candidate) =>
      candidate.id === call.name && (call.version === undefined || candidate.version === call.version));
    if (!definition) {
      throw new HarnessError('invalid_tool_call', 'The tool call does not match the advertised snapshot.');
    }
    const { required, properties } = definition.inputSchema;
    for (const field of required) {
      if (!(field in call.arguments)) {
        throw new HarnessError('invalid_tool_call', `Tool call is missing required argument '${field}'.`);
      }
    }
    for (const [field, value] of Object.entries(call.arguments)) {
      const expected = properties[field];
      if (!expected || typeof value !== expected) {
        throw new HarnessError('invalid_tool_call', `Tool call argument '${field}' has the wrong type.`);
      }
    }
    return structuredClone(definition);
  }

  execute(definition: HarnessToolDefinition, call: HarnessToolCall, actionId: string, scope: HarnessScope): HarnessToolResult {
    if (definition.effect !== 'none') {
      throw new HarnessError('denied', 'This tool requires a qualified executor and a granted capability.');
    }
    const probe = String(call.arguments.probe ?? '');
    const expect = typeof call.arguments.expect === 'string' ? call.arguments.expect : undefined;
    const content = JSON.stringify({
      probe,
      probeDigest: createHash('sha256').update(probe).digest('hex').slice(0, 16),
      matched: expect === undefined ? null : expect === probe,
      actorId: scope.actorId,
    });
    if (Buffer.byteLength(content, 'utf8') > definition.maxOutputBytes) {
      throw new HarnessError('invalid_tool_call', 'Tool output exceeded the advertised bound.');
    }
    return {
      callId: call.id,
      actionId,
      toolId: definition.id,
      version: definition.version,
      status: 'completed',
      content,
      machine: { probe, matched: expect === undefined ? null : expect === probe },
      ui: { label: `${definition.id} v${definition.version}`, status: 'ok' },
      evidenceRef: `harness://action/${actionId}`,
    };
  }
}
