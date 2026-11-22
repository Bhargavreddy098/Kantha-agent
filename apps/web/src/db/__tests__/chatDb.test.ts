import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupConversationsByDate, generateConversationTitle } from "../useChatHistory";

describe("Dexie Chat Storage Helpers", () => {
  describe("groupConversationsByDate", () => {
    it("should categorize conversations into Today, Yesterday, Previous 7 Days, and Older", () => {
      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const convToday = {
        id: "c-1",
        title: "Swiss typography inquiry",
        createdAt: now - 1000 * 60 * 30, // 30 mins ago
        updatedAt: now - 1000 * 60 * 30,
      };

      const convYesterday = {
        id: "c-2",
        title: "Bauhaus grid system",
        createdAt: now - ONE_DAY_MS - 1000 * 60, // 1 day and 1 min ago
        updatedAt: now - ONE_DAY_MS,
      };

      const convLastWeek = {
        id: "c-3",
        title: "Helvetica font analysis",
        createdAt: now - ONE_DAY_MS * 4, // 4 days ago
        updatedAt: now - ONE_DAY_MS * 4,
      };

      const convOlder = {
        id: "c-4",
        title: "Emil Ruder layout rules",
        createdAt: now - ONE_DAY_MS * 14, // 14 days ago
        updatedAt: now - ONE_DAY_MS * 14,
      };

      const groups = groupConversationsByDate([
        convToday,
        convYesterday,
        convLastWeek,
        convOlder,
      ]);

      assert.equal(groups.today.length, 1);
      assert.equal(groups.today[0].id, "c-1");

      assert.equal(groups.yesterday.length, 1);
      assert.equal(groups.yesterday[0].id, "c-2");

      assert.equal(groups.previous7Days.length, 1);
      assert.equal(groups.previous7Days[0].id, "c-3");

      assert.equal(groups.older.length, 1);
      assert.equal(groups.older[0].id, "c-4");
    });
  });

  describe("generateConversationTitle", () => {
    it("should generate a clean title from the user prompt", () => {
      const prompt = "How do I align text to a strict 12-column grid in Swiss editorial design?";
      const title = generateConversationTitle(prompt);
      assert.ok(title.length <= 40);
      assert.ok(title.startsWith("How do I align"));
    });

    it("should handle short prompts without truncation", () => {
      const prompt = "Hello!";
      const title = generateConversationTitle(prompt);
      assert.equal(title, "Hello!");
    });
  });
});
