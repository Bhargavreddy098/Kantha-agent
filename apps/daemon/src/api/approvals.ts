import crypto from "node:crypto";
import { Effect, Deferred, Duration } from "effect";
import { approvals, eq, and } from "@kantha/db";

export interface ToolApprovalDecision {
  decision: "approve" | "reject";
  feedback?: string;
}

export interface RequestApprovalOptions {
  sessionId: string;
  runId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  autoApprove?: boolean;
  timeoutMs?: number;
}

interface PendingApproval {
  id: string;
  sessionId: string;
  runId: string;
  callId: string;
  deferred: Deferred.Deferred<ToolApprovalDecision, never>;
}

export class ApprovalManager {
  private db: any;
  private pending = new Map<string, PendingApproval>();

  constructor({ db }: { db: any }) {
    this.db = db;
  }

  requestApproval(options: RequestApprovalOptions): Effect.Effect<ToolApprovalDecision, never> {
    const { sessionId, runId, callId, toolName, args, autoApprove, timeoutMs } = options;

    if (autoApprove || toolName === "read_file" || toolName === "list_files") {
      return Effect.succeed({ decision: "approve" });
    }

    const approvalId = `appr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const timeoutDuration =
      timeoutMs !== undefined ? Duration.millis(timeoutMs) : Duration.minutes(10);

    return Effect.gen(this, function* () {
      const deferred = yield* Deferred.make<ToolApprovalDecision, never>();

      const entry: PendingApproval = {
        id: approvalId,
        sessionId,
        runId,
        callId,
        deferred,
      };
      this.pending.set(approvalId, entry);

      // Insert pending row into SQLite
      yield* Effect.promise(() =>
        this.db.insert(approvals).values({
          id: approvalId,
          sessionId,
          callId,
          toolName,
          args: typeof args === "string" ? args : JSON.stringify(args),
          status: "pending",
          createdAt: Date.now(),
        })
      );

      // Await deferred with timeout
      const res = yield* Deferred.await(deferred).pipe(
        Effect.timeoutOption(timeoutDuration)
      );

      if (res._tag === "None") {
        // Timed out
        this.pending.delete(approvalId);
        yield* Effect.promise(() =>
          this.db
            .update(approvals)
            .set({ status: "timed_out" })
            .where(eq(approvals.id, approvalId))
        );
        return {
          decision: "reject" as const,
          feedback: `Approval timed out after ${timeoutMs !== undefined ? `${timeoutMs}ms` : "10 minutes"}`,
        };
      }

      return res.value;
    });
  }

  async resolveApproval(
    approvalId: string,
    decision: "approve" | "reject",
    feedback?: string
  ): Promise<void> {
    const entry = this.pending.get(approvalId);
    const newStatus = decision === "approve" ? "approved" : "rejected";

    await this.db
      .update(approvals)
      .set({ status: newStatus })
      .where(eq(approvals.id, approvalId));

    if (entry) {
      this.pending.delete(approvalId);
      await Effect.runPromise(Deferred.succeed(entry.deferred, { decision, feedback }));
    }
  }

  async cancelPendingApprovals(sessionId: string, runId?: string): Promise<void> {
    const toCancel: PendingApproval[] = [];
    for (const [id, entry] of this.pending.entries()) {
      if (entry.sessionId === sessionId && (!runId || entry.runId === runId)) {
        toCancel.push(entry);
        this.pending.delete(id);
      }
    }

    if (toCancel.length > 0) {
      for (const entry of toCancel) {
        await this.db
          .update(approvals)
          .set({ status: "cancelled" })
          .where(eq(approvals.id, entry.id));
      }
    } else {
      await this.db
        .update(approvals)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(approvals.sessionId, sessionId),
            eq(approvals.status, "pending")
          )
        );
    }

    for (const entry of toCancel) {
      await Effect.runPromise(
        Deferred.succeed(entry.deferred, {
          decision: "reject",
          feedback: "Run was aborted",
        })
      );
    }
  }

  async getPendingApprovals(sessionId: string) {
    return this.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.sessionId, sessionId),
          eq(approvals.status, "pending")
        )
      );
  }
}
