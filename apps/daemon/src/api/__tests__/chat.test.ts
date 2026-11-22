import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatSseEvent,
  sanitizeMessagesForUpstream,
  parseOpenAiDelta,
  convertToCoreMessages,
  createLanguageModel,
} from "../chat";

describe("Chat SSE Streaming Service", () => {
  describe("convertToCoreMessages", () => {
    it("should transform messages into AI SDK CoreMessage format", () => {
      const messages = [
        { role: "user", content: "Hello AI" },
        { role: "assistant", content: "Hello user", reasoning: "Greeting response" },
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this image" },
            { type: "image_url", image_url: { url: "data:image/png;base64,mockpng" } },
          ],
        },
      ];

      const core = convertToCoreMessages(messages);
      assert.equal(core.length, 3);
      assert.equal(core[0].role, "user");
      assert.equal(core[0].content, "Hello AI");

      assert.equal(core[1].role, "assistant");
      assert.equal(core[1].content, "Hello user");
      assert.equal((core[1] as any).reasoning, undefined);

      assert.equal(core[2].role, "user");
      assert.ok(Array.isArray(core[2].content));
      const parts = core[2].content as any[];
      assert.equal(parts[0].type, "text");
      assert.equal(parts[1].type, "image");
      assert.equal(parts[1].image, "data:image/png;base64,mockpng");
    });
  });

  describe("createLanguageModel factory", () => {
    it("should instantiate OpenAI language model", () => {
      const model = createLanguageModel(
        { id: "openai", name: "OpenAI", type: "openai", apiKey: "mock", models: [] },
        "gpt-4o"
      );
      assert.ok(model);
      assert.equal(model.modelId, "gpt-4o");
    });

    it("should instantiate Anthropic language model", () => {
      const model = createLanguageModel(
        { id: "anthropic", name: "Anthropic", type: "anthropic", apiKey: "mock", models: [] },
        "claude-3-7-sonnet"
      );
      assert.ok(model);
      assert.equal(model.modelId, "claude-3-7-sonnet");
    });

    it("should instantiate OpenAI-compatible language model (Groq/Ollama/Custom)", () => {
      const model = createLanguageModel(
        {
          id: "groq",
          name: "Groq",
          type: "openai_compatible",
          baseURL: "https://api.groq.com/openai/v1",
          apiKey: "mock",
          models: [],
        },
        "llama-3.3-70b-versatile"
      );
      assert.ok(model);
      assert.equal(model.modelId, "llama-3.3-70b-versatile");
    });
  });

  describe("sanitizeMessagesForUpstream", () => {
    it("should strip reasoning field from assistant messages", () => {
      const messages = [
        { role: "user", content: "What is 2+2?" },
        {
          role: "assistant",
          content: "4",
          reasoning: "The user is asking for elementary addition.",
        },
        { role: "user", content: "And plus 5?" },
      ];

      const sanitized = sanitizeMessagesForUpstream(messages);
      assert.equal(sanitized.length, 3);
      assert.deepEqual(sanitized[1], {
        role: "assistant",
        content: "4",
      });
      assert.equal((sanitized[1] as any).reasoning, undefined);
    });

    it("should truncate oversized document context if exceeding 30,000 characters", () => {
      const longText = "A".repeat(35000);
      const messages = [
        { role: "user", content: `Here is the doc:\n${longText}` },
      ];

      const sanitized = sanitizeMessagesForUpstream(messages);
      const content = sanitized[0].content as string;
      assert.ok(content.length < 35000);
      assert.ok(content.includes("[Document truncated"));
    });

    it("should truncate oversized text in multimodal array content", () => {
      const longText = "B".repeat(35000);
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: `Multimodal document text:\n${longText}` },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          ],
        },
      ];

      const sanitized = sanitizeMessagesForUpstream(messages);
      const parts = sanitized[0].content as Array<any>;
      assert.ok(parts[0].text.length < 35000);
      assert.ok(parts[0].text.includes("[Document truncated"));
    });

    it("should limit messages to last 20 messages sliding window", () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i + 1}`,
      }));

      const sanitized = sanitizeMessagesForUpstream(messages);
      assert.equal(sanitized.length, 20);
      assert.equal(sanitized[0].content, "Message 11");
      assert.equal(sanitized[19].content, "Message 30");
    });
  });

  describe("parseOpenAiDelta", () => {
    it("should extract both content and reasoning_content deltas", () => {
      const chunk1 = {
        choices: [
          {
            delta: {
              reasoning_content: "Thinking step 1...",
            },
          },
        ],
      };
      const parsed1 = parseOpenAiDelta(chunk1);
      assert.equal(parsed1.reasoning, "Thinking step 1...");
      assert.equal(parsed1.content, "");

      const chunk2 = {
        choices: [
          {
            delta: {
              content: "Here is the answer.",
            },
          },
        ],
      };
      const parsed2 = parseOpenAiDelta(chunk2);
      assert.equal(parsed2.reasoning, "");
      assert.equal(parsed2.content, "Here is the answer.");
    });

    it("should handle thinking delta format (Anthropic/DeepSeek compatibility)", () => {
      const chunk = {
        choices: [
          {
            delta: {
              thinking: "Deep reasoning step...",
            },
          },
        ],
      };
      const parsed = parseOpenAiDelta(chunk);
      assert.equal(parsed.reasoning, "Deep reasoning step...");
    });
  });

  describe("formatSseEvent", () => {
    it("should format valid SSE event string", () => {
      const formatted = formatSseEvent({ content: "Hello", reasoning: "" });
      assert.equal(formatted, 'data: {"content":"Hello","reasoning":""}\n\n');
    });

    it("should format [DONE] event", () => {
      const formatted = formatSseEvent("[DONE]");
      assert.equal(formatted, "data: [DONE]\n\n");
    });

    it("should format error event with error message and empty reasoning", () => {
      const formatted = formatSseEvent({ content: "\n\n[Error: Rate limit exceeded]", reasoning: "" });
      assert.ok(formatted.includes("[Error: Rate limit exceeded]"));
      assert.ok(formatted.startsWith("data: {"));
    });
  });
});
