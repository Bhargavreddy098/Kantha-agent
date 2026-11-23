import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  StepStartedEvent,
  ReasoningDeltaEvent,
  TurnUsageEvent,
  ToolIntentEvent,
  KanthaEvent,
} from "../index";

describe("Milestone 2 Protocol Bridge Schemas", () => {
  it("encodes and decodes StepStartedEvent", () => {
    const raw = {
      type: "step_started",
      sessionId: "s1",
      stepIndex: 0,
      maxSteps: 15,
      timestamp: Date.now(),
    };
    const decoded = Schema.decodeUnknownSync(StepStartedEvent)(raw);
    assert.equal(decoded.stepIndex, 0);
    assert.equal(decoded.maxSteps, 15);

    // Verify it is part of KanthaEvent union
    const unionDecoded = Schema.decodeUnknownSync(KanthaEvent)(raw);
    assert.equal(unionDecoded.type, "step_started");
  });

  it("encodes and decodes ReasoningDeltaEvent", () => {
    const raw = {
      type: "reasoning_delta",
      sessionId: "s1",
      delta: "Thinking through solution...",
      timestamp: Date.now(),
    };
    const decoded = Schema.decodeUnknownSync(ReasoningDeltaEvent)(raw);
    assert.equal(decoded.delta, "Thinking through solution...");

    const unionDecoded = Schema.decodeUnknownSync(KanthaEvent)(raw);
    assert.equal(unionDecoded.type, "reasoning_delta");
  });

  it("encodes and decodes TurnUsageEvent with tier and costUsd", () => {
    const raw = {
      type: "turn_usage",
      sessionId: "s1",
      stepIndex: 1,
      modelId: "gpt-4o",
      tier: 1,
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 0,
      costUsd: 0.00045,
      timestamp: Date.now(),
    };
    const decoded = Schema.decodeUnknownSync(TurnUsageEvent)(raw);
    assert.equal(decoded.tier, 1);
    assert.equal(decoded.costUsd, 0.00045);

    const unionDecoded = Schema.decodeUnknownSync(KanthaEvent)(raw);
    assert.equal(unionDecoded.type, "turn_usage");
  });

  it("encodes and decodes ToolIntentEvent with runId and actionId", () => {
    const raw = {
      type: "tool_intent",
      sessionId: "s1",
      runId: "r1",
      callId: "c1",
      actionId: "action_r1_c1",
      toolName: "write_file",
      args: { filePath: "src/app.ts" },
      timestamp: Date.now(),
    };
    const decoded = Schema.decodeUnknownSync(ToolIntentEvent)(raw);
    assert.equal(decoded.runId, "r1");
    assert.equal(decoded.actionId, "action_r1_c1");

    const unionDecoded = Schema.decodeUnknownSync(KanthaEvent)(raw);
    assert.equal(unionDecoded.type, "tool_intent");
  });
});
