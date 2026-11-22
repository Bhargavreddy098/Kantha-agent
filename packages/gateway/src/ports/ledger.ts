import { Context, type Effect } from "effect";
import type { LedgerEntry, SessionUsageSummary } from "../types/usage";

export class LedgerError extends Error {
  readonly _tag: string = "LedgerError";
}

export class BudgetExceededError extends LedgerError {
  override readonly _tag: string = "BudgetExceededError";
}

export interface BudgetCheckResult {
  readonly allowed: boolean;
  readonly remainingUsd?: number;
}

export interface LedgerStore {
  readonly checkBudget: (sessionId: string) => Effect.Effect<BudgetCheckResult, LedgerError>;
  readonly recordTurnUsage: (entry: LedgerEntry) => Effect.Effect<void, LedgerError>;
  readonly getSessionUsage: (sessionId: string) => Effect.Effect<SessionUsageSummary, LedgerError>;
}

export const LedgerStore = Context.GenericTag<LedgerStore>("@kantha/gateway/LedgerStore");
