import type { IUsageService } from '../contracts/adapters';
import type { AttemptReservation } from '../contracts/chat';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import type { AttemptAccounting, GatewayUsageSummary, ModelUsageSummary } from '../contracts/usage';
import { isActive, type RunRecord } from '../runs/state';
import type { GatewayDatabase } from './storage/database';

type ReservationInput = Omit<AttemptReservation, 'createdAt'> & {
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  runId?: string;
};

interface AttemptRecord {
  reservation: ReservationInput & { createdAt: string; estimatedTokens: number };
  accounting?: AttemptAccounting;
}

function utcDay(now: Date) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start, end: start + 24 * 60 * 60_000 };
}

function readLimit(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error(`${name} must be a positive number.`);
  return limit;
}

export class GatewayUsageService implements IUsageService {
  private readonly maxDailyTokens = readLimit('GATEWAY_MAX_DAILY_TOKENS') ?? 200_000;
  private readonly maxDailyBudgetUsd = readLimit('GATEWAY_MAX_DAILY_BUDGET_USD');

  constructor(private readonly db: GatewayDatabase) {}

  private recordsForWindow(ctx: RequestContext, now: Date): AttemptRecord[] {
    const { start, end } = utcDay(now);
    return this.db.list('attempts', ctx.workspaceId, start, end);
  }

  private commitments(records: AttemptRecord[]) {
    let tokens = 0;
    let costUsd = 0;
    for (const { reservation, accounting } of records) {
      if (accounting?.status === 'refunded') continue;
      tokens += accounting?.tokens?.total ?? reservation.estimatedTokens;
      costUsd += accounting?.costUsd ?? reservation.estimatedCostUsd ?? 0;
    }
    return { tokens, costUsd };
  }

  async reserveAttempt(input: ReservationInput, ctx: RequestContext): Promise<boolean> {
    if (input.workspaceId !== ctx.workspaceId || input.status !== 'reserved') return false;
    const estimatedTokens = Math.ceil(input.estimatedTokens ?? 8_192);
    if (!Number.isSafeInteger(estimatedTokens) || estimatedTokens < 1) return false;
    if (input.estimatedCostUsd !== undefined && (!Number.isFinite(input.estimatedCostUsd) || input.estimatedCostUsd < 0)) return false;

    return this.db.write(() => {
      const now = new Date();
      if (this.db.get<AttemptRecord>('attempts', ctx.workspaceId, input.attemptId)) return false;
      const { tokens, costUsd } = this.commitments(this.recordsForWindow(ctx, now));
      if (tokens + estimatedTokens > this.maxDailyTokens) return false;
      if (this.maxDailyBudgetUsd !== undefined &&
        (input.estimatedCostUsd === undefined || costUsd + input.estimatedCostUsd > this.maxDailyBudgetUsd)) return false;

      const record: AttemptRecord = {
        reservation: { ...input, estimatedTokens, createdAt: now.toISOString() },
      };
      this.db.put('attempts', ctx.workspaceId, input.attemptId, record, now.getTime());
      return true;
    });
  }

  async settleAttempt(input: AttemptAccounting, ctx: RequestContext): Promise<void> {
    this.db.write(() => {
      const record = this.db.get<AttemptRecord>('attempts', ctx.workspaceId, input.attemptId);
      if (!record || input.workspaceId !== ctx.workspaceId ||
        record.reservation.reservationId !== input.reservationId ||
        record.reservation.modelId !== input.modelId ||
        record.reservation.connectionId !== input.connectionId ||
        (record.reservation.runId !== undefined && record.reservation.runId !== input.runId)) {
        throw new GatewayError({ code: 'not_found', message: 'Attempt reservation not found', requestId: ctx.requestId });
      }
      if (record.accounting) return;
      if (input.status !== 'settled' && input.status !== 'refunded') {
        throw new GatewayError({ code: 'invalid_request', message: 'Attempt accounting needs a terminal status', requestId: ctx.requestId });
      }

      const tokens = input.tokens && Object.values(input.tokens).every((value) => Number.isSafeInteger(value) && value >= 0)
        ? input.tokens : undefined;
      const costUsd = typeof input.costUsd === 'number' && Number.isFinite(input.costUsd) && input.costUsd >= 0
        ? input.costUsd : undefined;
      record.accounting = {
        ...input, tokens, costUsd, settledAt: new Date().toISOString(),
      };
      this.db.put('attempts', ctx.workspaceId, input.attemptId, record, Date.parse(record.reservation.createdAt));
    });
  }

  private reconcileTerminalRuns(records: AttemptRecord[], ctx: RequestContext): void {
    const runIds = records.flatMap(({ accounting, reservation }) =>
      !accounting && reservation.runId ? [reservation.runId] : []);
    const runs = this.db.getMany<RunRecord>('runs', ctx.workspaceId, [...new Set(runIds)]);
    for (const record of records) {
      if (record.accounting || !record.reservation.runId) continue;
      const stored = runs.get(record.reservation.runId);
      // A completed handler can still deliver final metering briefly after publishing run state.
      if (!stored?.run.completedAt || isActive(stored.run.status) ||
        Date.now() - Date.parse(stored.run.completedAt) < 30_000) continue;

      const { attemptId, reservationId, workspaceId, runId, connectionId, modelId, createdAt } = record.reservation;
      record.accounting = {
        attemptId, reservationId, workspaceId, runId, connectionId, modelId,
        status: 'settled',
        durationMs: Math.max(0, Date.parse(stored.run.completedAt) - Date.parse(createdAt)),
        settledAt: new Date().toISOString(),
      };
      this.db.put('attempts', ctx.workspaceId, attemptId, record, Date.parse(createdAt));
    }
  }

  async getUsage(ctx: RequestContext): Promise<GatewayUsageSummary> {
    return this.db.write(() => {
      const now = new Date();
      const records = this.recordsForWindow(ctx, now);
      this.reconcileTerminalRuns(records, ctx);

      const { start, end } = utcDay(now);
      const { tokens, costUsd } = this.commitments(records);
      const totals = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalRequests: 0, estimatedCostUsd: 0 as number | undefined };
      const models = new Map<string, ModelUsageSummary>();
      let containsUnknownUsage = false;

      for (const { reservation, accounting } of records) {
        if (!accounting || accounting.status === 'refunded') continue;
        const modelId = reservation.modelId;
        const model = models.get(modelId) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, estimatedCostUsd: 0 };
        const prompt = accounting.tokens?.prompt ?? 0;
        const completion = accounting.tokens?.completion ?? 0;
        const measured = accounting.tokens?.total ?? 0;
        const cost = accounting.costUsd ?? reservation.estimatedCostUsd;
        if (!accounting.tokens || accounting.costUsd === undefined) containsUnknownUsage = true;

        totals.promptTokens += prompt;
        totals.completionTokens += completion;
        totals.totalTokens += measured;
        totals.totalRequests++;
        totals.estimatedCostUsd = totals.estimatedCostUsd !== undefined && cost !== undefined ? totals.estimatedCostUsd + cost : undefined;
        model.promptTokens += prompt;
        model.completionTokens += completion;
        model.totalTokens += measured;
        model.requests++;
        model.estimatedCostUsd = model.estimatedCostUsd !== undefined && cost !== undefined ? model.estimatedCostUsd + cost : undefined;
        models.set(modelId, model);
      }
      if (records.some((record) => !record.accounting)) containsUnknownUsage = true;
      return {
        workspaceId: ctx.workspaceId,
        window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        freshness: containsUnknownUsage ? 'estimated' : 'fresh',
        totals,
        limits: {
          maxDailyTokens: this.maxDailyTokens,
          maxDailyBudgetUsd: this.maxDailyBudgetUsd,
          currentTokensUsed: tokens,
          currentBudgetUsdUsed: costUsd,
          isExceeded: tokens >= this.maxDailyTokens ||
            (this.maxDailyBudgetUsd !== undefined && costUsd >= this.maxDailyBudgetUsd),
        },
        byModel: Object.fromEntries(models),
        lastUpdatedAt: now.toISOString(),
      };
    });
  }
}
