import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatAnthropicMessages } from "../anthropic";
import type { KanthaMessage } from "../../types/request";

describe("Anthropic Adapter Formatting", () => {
  it("preserves thinking blocks and cryptographic signatures across turns", () => {
    const messages: KanthaMessage[] = [
      { role: "user", content: "Solve this riddle" },
      {
        role: "assistant",
        content: "The answer is 42",
        reasonings: [
          {
            type: "thinking",
            text: "Let me think carefully...",
            signature: "sig_abc123xyz_cryptographic_signature",
          },
        ],
        toolCalls: [
          {
            id: "call_tool_1",
            name: "calculator",
            arguments: { expr: "6 * 7" },
          },
        ],
      },
      {
        role: "tool",
        content: "",
        toolResults: [
          {
            callId: "call_tool_1",
            toolName: "calculator",
            content: { result: 42 },
          },
        ],
      },
    ];

    const formatted = formatAnthropicMessages(messages, { cacheBreakpoints: true });
    assert.equal(formatted.length, 3);

    // Assistant message contains thinking block with exact signature
    const assistantMsg = formatted[1];
    assert.equal(assistantMsg.role, "assistant");
    assert.ok(Array.isArray(assistantMsg.content));

    const thinkingBlock = assistantMsg.content.find((p: any) => p.type === "thinking");
    assert.ok(thinkingBlock);
    assert.equal(thinkingBlock.thinking, "Let me think carefully...");
    assert.equal(thinkingBlock.signature, "sig_abc123xyz_cryptographic_signature");

    // Tool result message
    const toolMsg = formatted[2];
    assert.equal(toolMsg.role, "user");
    const toolResultBlock = toolMsg.content.find((p: any) => p.type === "tool_result");
    assert.ok(toolResultBlock);
    assert.equal(toolResultBlock.tool_use_id, "call_tool_1");
  });
});
