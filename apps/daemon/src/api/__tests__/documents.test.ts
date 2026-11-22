import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractDocumentContent, isSupportedDocumentFormat, MAX_FILE_SIZE_BYTES } from "../documents";

describe("Document Text Extraction Service", () => {
  describe("isSupportedDocumentFormat", () => {
    it("should accept valid document extensions", () => {
      assert.ok(isSupportedDocumentFormat("report.pdf"));
      assert.ok(isSupportedDocumentFormat("document.docx"));
      assert.ok(isSupportedDocumentFormat("notes.txt"));
      assert.ok(isSupportedDocumentFormat("README.md"));
      assert.ok(isSupportedDocumentFormat("data.csv"));
    });

    it("should reject unsupported extensions", () => {
      assert.ok(!isSupportedDocumentFormat("image.png"));
      assert.ok(!isSupportedDocumentFormat("binary.exe"));
      assert.ok(!isSupportedDocumentFormat("archive.zip"));
    });
  });

  describe("extractDocumentContent", () => {
    it("should extract text from plain text and markdown buffers", async () => {
      const textBuffer = Buffer.from("# Swiss Style\nMinimalism and grid precision.", "utf-8");
      const result = await extractDocumentContent("notes.md", textBuffer);

      assert.equal(result.filename, "notes.md");
      assert.ok(result.extractedText.includes("Swiss Style"));
      assert.ok(result.extractedText.includes("grid precision"));
      assert.equal(result.charCount, result.extractedText.length);
    });

    it("should extract text from CSV buffers", async () => {
      const csvBuffer = Buffer.from("id,name,role\n1,Max Bill,Designer\n2,Josef Müller,Typographer", "utf-8");
      const result = await extractDocumentContent("designers.csv", csvBuffer);

      assert.equal(result.filename, "designers.csv");
      assert.ok(result.extractedText.includes("Max Bill"));
      assert.ok(result.extractedText.includes("Josef Müller"));
    });

    it("should throw error if buffer exceeds 10MB limit", async () => {
      const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024);
      await assert.rejects(
        async () => {
          await extractDocumentContent("huge.txt", oversizedBuffer);
        },
        {
          message: /exceeds maximum allowed size/,
        }
      );
    });
  });
});
