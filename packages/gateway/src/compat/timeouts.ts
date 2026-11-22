export class TimeoutError extends Error {
  readonly _tag = "TimeoutError";
  readonly type: "header" | "chunk" | "total";

  constructor(type: "header" | "chunk" | "total", message: string) {
    super(`Gateway Timeout [${type}]: ${message}`);
    this.name = "TimeoutError";
    this.type = type;
  }
}

export interface TimeoutConfig {
  headerTimeoutMs?: number;
  chunkTimeoutMs?: number;
  totalTimeoutMs?: number;
}

export class TimeoutPolicy {
  readonly headerTimeoutMs: number;
  readonly chunkTimeoutMs: number;
  readonly totalTimeoutMs?: number;

  private startTime: number = Date.now();
  private lastChunkTime: number = Date.now();
  private headersReceived: boolean = false;

  constructor(config: TimeoutConfig = {}) {
    // Defaults matching OpenCode: 10 min header, 15 min chunk
    this.headerTimeoutMs = config.headerTimeoutMs ?? 600_000;
    this.chunkTimeoutMs = config.chunkTimeoutMs ?? 900_000;
    this.totalTimeoutMs = config.totalTimeoutMs;
  }

  onHeadersReceived(): void {
    this.headersReceived = true;
    this.lastChunkTime = Date.now();
  }

  onChunkReceived(): void {
    this.lastChunkTime = Date.now();
  }

  checkHeaderTimeout(): void {
    if (!this.headersReceived && Date.now() - this.startTime > this.headerTimeoutMs) {
      throw new TimeoutError("header", `No response headers received within ${this.headerTimeoutMs}ms`);
    }
  }

  checkChunkTimeout(): void {
    if (Date.now() - this.lastChunkTime > this.chunkTimeoutMs) {
      throw new TimeoutError("chunk", `No stream chunk received within ${this.chunkTimeoutMs}ms`);
    }
  }

  checkTotalTimeout(): void {
    if (this.totalTimeoutMs && Date.now() - this.startTime > this.totalTimeoutMs) {
      throw new TimeoutError("total", `Request exceeded total timeout of ${this.totalTimeoutMs}ms`);
    }
  }
}
