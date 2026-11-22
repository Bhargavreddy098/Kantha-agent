import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOpenAiCompatibleChunk } from "../compatible";

describe("OpenAI-Compatible Adapter Quirks", () => {
  it("extracts custom reasoningField like reasoning_content or thinking from SSE chunk", () => {
    const chunkWithReasoningContent = {
      choices: [
        {
          delta: {
            reasoning_content: "DeepSeek internal thinking chunk",
            content: "Hello",
          },
        },
      ],
    };

    const parsed1 = parseOpenAiCompatibleChunk(chunkWithReasoningContent, {
      reasoningField: "reasoning_content",
    });

    assert.equal(parsed1.content, "Hello");
    assert.equal(parsed1.reasoning, "DeepSeek internal thinking chunk");

    const chunkWithThinking = {
      choices: [
        {
          delta: {
            thinking: "Another model thinking block",
            content: "",
          },
        },
      ],
    };

    const parsed2 = parseOpenAiCompatibleChunk(chunkWithThinking, {
      reasoningField: "thinking",
    });

    assert.equal(parsed2.reasoning, "Another model thinking block");
  });
});
