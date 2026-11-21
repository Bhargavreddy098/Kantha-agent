import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface PtyOptions {
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface IPtySession {
  id: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (chunk: string) => void): void;
  onExit(cb: (code: number) => void): void;
}

/**
 * Cross-platform terminal process manager.
 * On POSIX: Can leverage Bun.Terminal.
 * On Windows/Node: Spawns interactive shell process with piped streams.
 */
export class PtyManager {
  private sessions = new Map<string, IPtySession>();

  createSession(id: string, options: PtyOptions = {}): IPtySession {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? (process.env.COMSPEC || "powershell.exe") : (process.env.SHELL || "/bin/bash");

    const proc = spawn(shell, [], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const emitter = new EventEmitter();

    proc.stdout?.on("data", (chunk: Buffer) => {
      emitter.emit("data", chunk.toString("utf8"));
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      emitter.emit("data", chunk.toString("utf8"));
    });

    proc.on("exit", (code: number | null) => {
      emitter.emit("exit", code ?? 0);
      this.sessions.delete(id);
    });

    const session: IPtySession = {
      id,
      write: (data: string) => {
        proc.stdin?.write(data);
      },
      resize: (_cols: number, _rows: number) => {
        // resize handler if native PTY is bound
      },
      kill: () => {
        proc.kill();
        this.sessions.delete(id);
      },
      onData: (cb) => {
        emitter.on("data", cb);
      },
      onExit: (cb) => {
        emitter.on("exit", cb);
      },
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): IPtySession | undefined {
    return this.sessions.get(id);
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
  }
}

export const ptyManager = new PtyManager();
