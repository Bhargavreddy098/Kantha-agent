import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialPlan,
  updatePlanStep,
  partitionToolCalls,
  buildOrchestratorSystemPrompt,
  buildToolTurnMessages,
  compactMessagesForBudget,
} from "../orchestrator";
import { isReadOnlyTool, getToolCatalog } from "../tools";
import type { KanthaMessage } from "@kantha/gateway";

describe("Harness Orchestrator Pure Engine", () => {
  it("creates and immutably updates a 3-step execution plan", () => {
    const initial = createInitialPlan("Audit gateway resilience and tools");
    assert.equal(initial.length, 3);
    assert.equal(initial[0].status, "in_progress");
    assert.equal(initial[1].status, "pending");

    const updated = updatePlanStep(initial, "plan_inspect", "completed", "Done");
    assert.equal(initial[0].status, "in_progress"); // original unchanged
    assert.equal(updated[0].status, "completed");
    assert.equal(updated[0].detail, "Done");
  });

  it("batches consecutive read-only tools in parallel while isolating write/exec calls sequentially", () => {
    const calls = [
      { id: "c1", name: "inspect_workspace", args: {} },
      { id: "c2", name: "git_status", args: {} },
      { id: "c3", name: "read_file", args: { filePath: "package.json" } },
      { id: "c4", name: "edit_file", args: { filePath: "a.ts", oldString: "x", newString: "y" } },
      { id: "c5", name: "execute_command", args: { command: "npm test" } },
      { id: "c6", name: "read_file", args: { filePath: "a.ts" } },
      { id: "c7", name: "grep_search", args: { pattern: "y" } },
    ];

    const batches = partitionToolCalls(calls, isReadOnlyTool);
    assert.equal(batches.length, 4);
    assert.equal(batches[0].mode, "parallel");
    assert.deepEqual(batches[0].calls.map((c) => c.id), ["c1", "c2", "c3"]);

    assert.equal(batches[1].mode, "sequential");
    assert.deepEqual(batches[1].calls.map((c) => c.id), ["c4"]);

    assert.equal(batches[2].mode, "sequential");
    assert.deepEqual(batches[2].calls.map((c) => c.id), ["c5"]);

    assert.equal(batches[3].mode, "parallel");
    assert.deepEqual(batches[3].calls.map((c) => c.id), ["c6", "c7"]);
  });

  it("constructs spec-compliant assistant toolCalls + tool toolResults messages", () => {
    const msgs = buildToolTurnMessages(
      "Let me inspect the workspace.",
      [{ id: "call_1", name: "inspect_workspace", args: {} }],
      [{ callId: "call_1", toolName: "inspect_workspace", output: '{"name":"kantha"}', isError: false }]
    );

    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, "assistant");
    assert.equal(msgs[0].toolCalls?.length, 1);
    assert.equal(msgs[0].toolCalls?.[0].name, "inspect_workspace");

    assert.equal(msgs[1].role, "tool");
    assert.equal(msgs[1].toolResults?.length, 1);
    assert.equal(msgs[1].toolResults?.[0].callId, "call_1");
    assert.equal(msgs[1].toolResults?.[0].content, '{"name":"kantha"}');
  });

  it("compacts oversized older tool results while keeping system prompt and recent turns intact", () => {
    const bigBlob = "x".repeat(4000);
    const messages: KanthaMessage[] = [
      { role: "system", content: "SYSTEM_PROMPT" },
      { role: "user", content: "INITIAL_GOAL" },
      { role: "assistant", content: "step 1", toolCalls: [{ id: "1", name: "read_file", arguments: {} }] },
      { role: "tool", content: "", toolResults: [{ callId: "1", toolName: "read_file", content: bigBlob }] },
      { role: "assistant", content: "step 2", toolCalls: [{ id: "2", name: "read_file", arguments: {} }] },
      { role: "tool", content: "", toolResults: [{ callId: "2", toolName: "read_file", content: bigBlob }] },
      { role: "assistant", content: "recent_turn_text" },
      { role: "user", content: "latest_user_prompt" },
    ];

    const res = compactMessagesForBudget(messages, 2500, 2);
    assert.equal(res.compacted, true);
    assert.ok(res.finalChars < res.originalChars);
    assert.equal(res.messages[0].content, "SYSTEM_PROMPT");
    assert.equal(res.messages[res.messages.length - 1].content, "latest_user_prompt");
    const compactedOutput = String(res.messages[3].toolResults?.[0].content || "");
    assert.ok(compactedOutput.includes("compacted"));
  });

  it("builds a grounded orchestrator system prompt listing all 10 tools", () => {
    const catalog = getToolCatalog();
    assert.equal(catalog.length, 10);
    const prompt = buildOrchestratorSystemPrompt(
      {
        name: "kantha",
        gitBranch: "main",
        topLevelEntries: ["apps", "packages", "docs"],
        packageInfo: { name: "kantha-monorepo", scripts: ["build", "test"] },
      },
      catalog
    );
    assert.ok(prompt.includes("inspect_workspace"));
    assert.ok(prompt.includes("edit_file"));
    assert.ok(prompt.includes("execute_command"));
  });
});
