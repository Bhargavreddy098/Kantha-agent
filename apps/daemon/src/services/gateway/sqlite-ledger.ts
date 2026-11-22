import { Layer, Effect } from "effect";
import {
  LedgerStore,
  LedgerError,
  type BudgetCheckResult,
  type LedgerEntry,
  type SessionUsageSummary,
} from "@kantha/gateway";
import { usageLedger, eq } from "@kantha/db";

export function createSqliteLedgerLayer(db: any) {
  return Layer.sync(LedgerStore, () => ({
    checkBudget: (sessionId: string) =>
      Effect.tryPromise({
        try: async (): Promise<BudgetCheckResult> => {
          const budgetLimitEnv = process.env.KANTHA_SESSION_BUDGET_USD;
          if (!budgetLimitEnv) {
            return { allowed: true };
          }

          const budgetLimit = Number(budgetLimitEnv);
          if (isNaN(budgetLimit) || budgetLimit <= 0) {
            return { allowed: true };
          }

          const rows = await db
            .select()
            .from(usageLedger)
            .where(eq(usageLedger.sessionId, sessionId));

          let currentSpend = 0;
          for (const row of rows) {
            currentSpend += Number(row.costUsd || 0);
          }

          if (currentSpend >= budgetLimit) {
            return {
              allowed: false,
              remainingUsd: 0,
            };
          }

          return {
            allowed: true,
            remainingUsd: Math.max(0, budgetLimit - currentSpend),
          };
        },
        catch: (err) => new LedgerError(`Failed to check budget in sqlite: ${String(err)}`),
      }),

    recordTurnUsage: (entry: LedgerEntry) =>
      Effect.tryPromise({
        try: async () => {
          await db.insert(usageLedger).values({
            id: entry.id,
            sessionId: entry.sessionId,
            turnId: entry.turnId,
            providerId: entry.providerId,
            modelId: entry.modelId,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
            reasoningTokens: entry.reasoningTokens,
            cacheReadTokens: entry.cacheReadTokens,
            cacheWrite5mTokens: entry.cacheWrite5mTokens,
            cacheWrite1hTokens: entry.cacheWrite1hTokens,
            costUsd: entry.costUsd,
            estimated: entry.estimated,
            status: entry.status,
            timestamp: entry.timestamp,
          });
        },
        catch: (err) => new LedgerError(`Failed to record turn usage in sqlite: ${String(err)}`),
      }),

    getSessionUsage: (sessionId: string) =>
      Effect.tryPromise({
        try: async (): Promise<SessionUsageSummary> => {
          const rows = await db
            .select()
            .from(usageLedger)
            .where(eq(usageLedger.sessionId, sessionId));

          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalReasoningTokens = 0;
          let totalCacheReadTokens = 0;
          let totalCacheWriteTokens = 0;
          let totalCostUsd = 0;

          for (const row of rows) {
            totalInputTokens += Number(row.inputTokens || 0);
            totalOutputTokens += Number(row.outputTokens || 0);
            totalReasoningTokens += Number(row.reasoningTokens || 0);
            totalCacheReadTokens += Number(row.cacheReadTokens || 0);
            totalCacheWriteTokens +=
              Number(row.cacheWrite5mTokens || 0) + Number(row.cacheWrite1hTokens || 0);
            totalCostUsd += Number(row.costUsd || 0);
          }

          const totalTokens =
            totalInputTokens +
            totalOutputTokens +
            totalReasoningTokens +
            totalCacheReadTokens +
            totalCacheWriteTokens;

          return {
            sessionId,
            totalInputTokens,
            totalOutputTokens,
            totalReasoningTokens,
            totalCacheReadTokens,
            totalCacheWriteTokens,
            totalTokens,
            totalCostUsd,
            turnCount: rows.length,
          };
        },
        catch: (err) => new LedgerError(`Failed to get session usage from sqlite: ${String(err)}`),
      }),
  }));
}
