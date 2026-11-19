import { spawn } from "node:child_process";
import { join } from "node:path";

type DocumentKind = "pdf" | "docx";
type Job = () => void;

const maxActive = 2;
const maxWaiting = 6;
const timeoutMs = 30_000;
let active = 0;
const waiting: Job[] = [];

export class DocumentQueueUnavailable extends Error {}

async function parseInWorker(kind: DocumentKind, file: File, signal: AbortSignal): Promise<string | null> {
  const bytes = await file.arrayBuffer();
  signal.throwIfAborted();

  const script = join(process.cwd(), "src/lib/chat/document-worker.mjs");
  const worker = spawn(process.execPath, [script], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    serialization: "advanced",
    env: { NODE_ENV: process.env.NODE_ENV },
    windowsHide: true,
  });
  const closed = new Promise<void>((resolve) => worker.once("close", () => resolve()));

  let cancel: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise((resolve, reject) => {
      let result: { text?: string } | undefined;
      cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => reject(new DocumentQueueUnavailable("Document processing timed out.")), timeoutMs);

      worker.once("message", (message: { text?: string }) => { result = message; });
      worker.once("error", reject);
      worker.once("close", (code) => {
        if (code === 0 && result) resolve(result.text ?? null);
        else reject(new Error("Document parser process exited before returning a result."));
      });
      worker.send({ kind, bytes }, (error) => { if (error) reject(error); });
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    if (worker.exitCode === null && worker.signalCode === null) worker.kill();
    await closed;
  }
}

export function extractDocument(kind: DocumentKind, file: File, signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();
  if (active >= maxActive && waiting.length >= maxWaiting) {
    throw new DocumentQueueUnavailable("Document processing is busy. Try again shortly.");
  }

  return new Promise((resolve, reject) => {
    function cancelWaiting() {
      const index = waiting.indexOf(start);
      if (index !== -1) waiting.splice(index, 1);
      reject(signal.reason);
    }

    function start() {
      signal.removeEventListener("abort", cancelWaiting);
      active++;
      void parseInWorker(kind, file, signal).then(resolve, reject).finally(() => {
        active--;
        waiting.shift()?.();
      });
    }

    if (active < maxActive) {
      start();
    } else {
      waiting.push(start);
      signal.addEventListener("abort", cancelWaiting, { once: true });
    }
  });
}
