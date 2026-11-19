async function parseDocument({ kind, bytes }) {
  const buffer = Buffer.from(bytes);
  if (kind === "docx") {
    const { default: mammoth } = await import("mammoth");
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: value };
    } catch {
      return { unreadable: true };
    }
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    return { text };
  } catch {
    return { unreadable: true };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

process.once("message", async (job) => {
  const result = await parseDocument(job);
  process.send(result, (error) => {
    if (error) process.exitCode = 1;
    process.disconnect();
  });
});
