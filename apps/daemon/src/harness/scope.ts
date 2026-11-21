import { Effect, Scope } from "effect";
import type { IPtySession } from "../pty/manager";
import { ptyManager } from "../pty/manager";

/**
 * Wraps terminal PTY allocation in an Effect Scope.
 * Guarantees that when the Scope closes (or fiber is interrupted/cancelled),
 * the PTY process is killed immediately, eliminating zombie processes.
 */
export const makeManagedPty = (sessionId: string, cwd?: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      return ptyManager.createSession(sessionId, { cwd });
    }),
    (session: IPtySession) =>
      Effect.sync(() => {
        session.kill();
      })
  );
