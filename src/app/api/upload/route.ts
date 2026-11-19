import { DocumentQueueUnavailable, extractDocument } from '@/lib/chat/document-queue';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv']);

/** Central, configurable limits (shared with the UI through GET). */
function limits() {
  const maxFileSize = clampInt(process.env.UPLOAD_MAX_FILE_SIZE_MB, 20, 1, 50) * 1024 * 1024;
  const maxTextLength = clampInt(process.env.UPLOAD_MAX_TEXT_LENGTH, 100_000, 1_000, 400_000);
  return { maxFileSize, maxTextLength };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** UI-facing limits so client validation matches the server exactly. */
export async function GET() {
  const { maxFileSize, maxTextLength } = limits();
  return Response.json({
    maxFileSizeMb: Math.round(maxFileSize / (1024 * 1024)),
    maxTextLength,
    allowedTypes: [...ALLOWED_MIME_TYPES],
  }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}

export async function POST(request: Request) {
  const { maxFileSize, maxTextLength } = limits();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid form data. Expected multipart/form-data.' },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return Response.json(
      { success: false, error: 'No file provided. Use field name "file".' },
      { status: 400 },
    );
  }

  let fileType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME_TYPES.has(fileType)) {
    const ext = file.name?.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') fileType = 'text/markdown';
    else if (ext === 'csv') fileType = 'text/csv';
    else if (ext === 'txt') fileType = 'text/plain';
    else if (ext === 'pdf') fileType = 'application/pdf';
    else if (ext === 'docx') fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'png') fileType = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') fileType = 'image/jpeg';
    else if (ext === 'webp') fileType = 'image/webp';
  }

  if (!ALLOWED_MIME_TYPES.has(fileType)) {
    return Response.json(
      {
        success: false,
        error: `Unsupported file type: ${fileType}. Supported types: PNG, JPEG, WebP images; PDF; DOCX; TXT, Markdown and CSV.`,
      },
      { status: 400 },
    );
  }

  if (file.size > maxFileSize) {
    return Response.json(
      {
        success: false,
        error: `File too large. Maximum size is ${Math.round(maxFileSize / (1024 * 1024))}MB.`,
      },
      { status: 400 },
    );
  }

  const fileName = file.name || 'untitled';

  try {
    let textContent: string | undefined;

    if (IMAGE_TYPES.has(fileType)) {
      // Images are validated and passed through; their bytes travel directly
      // from the browser to the model, so nothing needs to be extracted here.
      return Response.json({ success: true, fileType, fileName });
    }

    if (TEXT_TYPES.has(fileType)) {
      textContent = await file.text();
    } else {
      const kind = fileType === 'application/pdf' ? 'pdf' : 'docx';
      const extracted = await extractDocument(kind, file, request.signal);
      if (extracted === null) {
        return Response.json({
          success: false,
          error: kind === 'pdf'
            ? 'This PDF could not be read. It may be encrypted, corrupted, or a scan without a text layer.'
            : 'This DOCX could not be read. It may be encrypted or corrupted.',
        }, { status: 422 });
      }
      textContent = extracted;
    }

    // Empty results are reported honestly instead of pretending the document
    // was read. PDFs without a text layer (scans) and encrypted files land here.
    if (textContent !== undefined) {
      textContent = textContent.trim();
      if (!textContent && fileType !== 'text/plain' && fileType !== 'text/csv' && fileType !== 'text/markdown') {
        return Response.json(
          {
            success: false,
            error: 'No readable text found. The document may be image-only or encrypted.',
          },
          { status: 422 },
        );
      }
      if (textContent.length > maxTextLength) {
        textContent =
          textContent.slice(0, maxTextLength) +
          `\n\n[... truncated, ${textContent.length - maxTextLength} characters omitted ...]`;
        return Response.json({
          success: true,
          textContent,
          truncated: true,
          fileType,
          fileName,
        });
      }
    }

    return Response.json({
      success: true,
      textContent: textContent || undefined,
      fileType,
      fileName,
    });
  } catch (err) {
    if (err instanceof DocumentQueueUnavailable) {
      return Response.json({ success: false, error: err.message }, { status: 503, headers: { 'Retry-After': '2' } });
    }
    return Response.json(
      {
        success: false,
        error: 'Failed to process the file.',
      },
      { status: 500 },
    );
  }
}
