import type http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
]);

export interface DocumentExtractResult {
  filename: string;
  extractedText: string;
  charCount: number;
}

/**
 * Validates if the file format is supported for server-side text extraction.
 */
export function isSupportedDocumentFormat(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Extracts plain readable text from a supported document buffer in-memory.
 */
export async function extractDocumentContent(
  filename: string,
  buffer: Buffer
): Promise<DocumentExtractResult> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File ${filename} exceeds maximum allowed size of 10MB (${(
        buffer.length /
        (1024 * 1024)
      ).toFixed(2)}MB).`
    );
  }

  const ext = path.extname(filename).toLowerCase();
  if (!isSupportedDocumentFormat(filename)) {
    throw new Error(`Unsupported document extension: ${ext}`);
  }

  let extractedText = "";

  switch (ext) {
    case ".txt":
    case ".md":
    case ".markdown":
    case ".csv": {
      extractedText = buffer.toString("utf-8");
      break;
    }

    case ".pdf": {
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      extractedText = typeof textResult === "string" ? textResult : textResult?.text || "";
      if (typeof parser.destroy === "function") {
        await parser.destroy();
      }
      break;
    }

    case ".docx": {
      const docxResult = await mammoth.extractRawText({ buffer });
      extractedText = docxResult.value || "";
      break;
    }

    default: {
      throw new Error(`Unsupported document extension: ${ext}`);
    }
  }

  // Normalize excessive whitespace while preserving paragraphs
  const cleanedText = extractedText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return {
    filename,
    extractedText: cleanedText,
    charCount: cleanedText.length,
  };
}

/**
 * HTTP handler for POST /api/documents/extract
 * Supports both JSON with base64 data and direct payload with x-filename header.
 */
export async function handleDocumentExtractRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  let bodyBuffer = Buffer.alloc(0);

  req.on("data", (chunk: Buffer) => {
    bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
    if (bodyBuffer.length > MAX_FILE_SIZE_BYTES + 1024 * 1024) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload exceeds 10MB maximum limit." }));
      req.destroy();
    }
  });

  req.on("end", async () => {
    if (res.headersSent) return;
    try {
      const contentType = req.headers["content-type"] || "";

      // 1. JSON Payload format: { filename: string, dataBase64: string }
      if (contentType.includes("application/json")) {
        const payload = JSON.parse(bodyBuffer.toString("utf-8"));
        const filename = payload.filename || "document.txt";
        const base64Data = payload.dataBase64 || "";

        if (!base64Data) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing dataBase64 in request body." }));
          return;
        }

        const buffer = Buffer.from(base64Data, "base64");
        const result = await extractDocumentContent(filename, buffer);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // 2. Direct binary or header-provided filename
      const customFilename = (req.headers["x-filename"] as string) || "document.txt";
      const result = await extractDocumentContent(customFilename, bodyBuffer);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Failed to extract document text." }));
    }
  });
}
