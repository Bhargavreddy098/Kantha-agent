export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_ATTACHMENTS = 5;
export const MAX_TOTAL_PAYLOAD = 25 * 1024 * 1024; // 25MB

export const ACCEPTED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
];

export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
];

export function isImageFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
}

export function isDocumentFile(file: { name: string; type: string }): boolean {
  return !isImageFile(file);
}

/**
 * Reads an image file as a base64 Data URL for previews and multimodal transmission.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Sends a document file to the Bun daemon's /api/documents/extract endpoint
 * to extract plain text without storing files on the server.
 */
export async function extractDocumentText(
  file: File
): Promise<{ filename: string; extractedText: string; charCount: number }> {
  // Read file as Data URL off-thread and extract base64 payload
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  const dataBase64 = dataUrl.split(",")[1] || "";

  const response = await fetch("/api/documents/extract", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      dataBase64,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Extraction failed with status ${response.status}`);
  }

  return await response.json();
}
