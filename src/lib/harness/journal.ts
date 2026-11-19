import { createHash, randomUUID } from 'node:crypto';
import {
  HarnessError,
  type HarnessAdmission,
  type HarnessCheckpoint,
  type HarnessClaim,
  type HarnessJournalEntry,
  type HarnessJournalEntryType,
  type HarnessScope,
  type HarnessSubmission,
  type IHarnessJournal,
  type IHarnessStore,
} from './contracts';

const admissions = 'harness_admissions';
const checkpoints = 'harness_checkpoints';
const claims = 'harness_claims';
const journals = 'harness_journals';

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalizedJson(entry)]),
    );
  }
  return value;
}

export function submissionDigest(submission: HarnessSubmission): string {
  return createHash('sha256').update(JSON.stringify(normalizedJson(submission))).digest('hex');
}

function admissionKey(submission: HarnessSubmission): string {
  return JSON.stringify([submission.sessionId, submission.inputId]);
}

function stableSourceEventId(runId: string, sequence: number, type: string, data: Record<string, unknown>): string {
  return `hsrc_${createHash('sha1')
    .update(`${runId}:${sequence}:${type}:${JSON.stringify(normalizedJson(data))}`)
    .digest('hex')
    .slice(0, 20)}`;
}

interface StoredJournal {
  runId: string;
  entries: HarnessJournalEntry[];
}

export class HarnessJournal implements IHarnessJournal {
  constructor(private readonly store: IHarnessStore) {}

  admit(submission: HarnessSubmission, runId: string, scope: HarnessScope): HarnessAdmission {
    return this.store.write(() => {
      const key = admissionKey(submission);
      const existing = this.store.get<HarnessAdmission>(admissions, scope.workspaceId, key);
      const digest = submissionDigest(submission);
      if (existing) {
        if (existing.digest !== digest || existing.runId !== runId) {
          throw new HarnessError('conflict', 'This input identity belongs to a different harness submission.');
        }
        return existing;
      }
      const byRun = this.store.get<HarnessAdmission>(admissions, scope.workspaceId, `run:${runId}`);
      if (byRun && (byRun.inputId !== submission.inputId || byRun.digest !== digest)) {
        throw new HarnessError('conflict', 'This run is already mapped to a different harness submission.');
      }

      const admission: HarnessAdmission = {
        runId,
        inputId: submission.inputId,
        digest,
        sessionId: submission.sessionId,
        receivedAt: new Date().toISOString(),
      };
      this.store.put(admissions, scope.workspaceId, key, admission);
      this.store.put(admissions, scope.workspaceId, `run:${runId}`, admission);
      this.store.put<StoredJournal>(journals, scope.workspaceId, runId, { runId, entries: [] });
      this.store.put<HarnessCheckpoint>(checkpoints, scope.workspaceId, runId, {
        runId,
        inputId: submission.inputId,
        phase: 'admitted',
        step: 0,
        inputPosition: 0,
        lastSourceEventId: '',
        completedCallIds: [],
        toolResults: {},
        assistantText: '',
        repairCount: 0,
        claimGeneration: 0,
        updatedAt: admission.receivedAt,
      });
      return admission;
    });
  }

  private listAdmissions(scope: HarnessScope): HarnessAdmission[] {
    // The run: alias stores the same value, so collapse it by run identity.
    const unique = new Map<string, HarnessAdmission>();
    for (const entry of this.store.list<HarnessAdmission>(admissions, scope.workspaceId)) {
      unique.set(entry.runId, entry);
    }
    return [...unique.values()];
  }

  getByInput(inputId: string, scope: HarnessScope): HarnessAdmission | null {
    // Input IDs are scoped by session, so scan admissions for this workspace.
    return this.store.write(() => this.listAdmissions(scope).find((entry) => entry.inputId === inputId) ?? null);
  }

  getByRun(runId: string, scope: HarnessScope): HarnessAdmission | null {
    return this.store.get<HarnessAdmission>(admissions, scope.workspaceId, `run:${runId}`);
  }

  listOpen(scope: HarnessScope): HarnessAdmission[] {
    return this.store.write(() => this.listAdmissions(scope));
  }

  claim(runId: string, ownerId: string, leaseMs: number, scope: HarnessScope): HarnessClaim {
    return this.store.write(() => {
      const existing = this.store.get<HarnessClaim>(claims, scope.workspaceId, runId);
      if (existing) {
        if (existing.expiresAt > Date.now()) {
          if (existing.ownerId !== ownerId) {
            throw new HarnessError('conflict', 'This harness run already has an active writer.');
          }
          return existing;
        }
      }
      const claim: HarnessClaim = {
        runId,
        generation: (existing?.generation ?? 0) + 1,
        ownerId,
        expiresAt: Date.now() + leaseMs,
      };
      this.store.put(claims, scope.workspaceId, runId, claim);
      return claim;
    });
  }

  reclaim(runId: string, ownerId: string, leaseMs: number, scope: HarnessScope): HarnessClaim | null {
    return this.store.write(() => {
      const existing = this.store.get<HarnessClaim>(claims, scope.workspaceId, runId);
      if (!existing || existing.expiresAt > Date.now()) return null;
      const claim: HarnessClaim = {
        runId,
        generation: existing.generation + 1,
        ownerId,
        expiresAt: Date.now() + leaseMs,
      };
      this.store.put(claims, scope.workspaceId, runId, claim);
      return claim;
    });
  }

  assertClaim(runId: string, generation: number, scope: HarnessScope): void {
    const claim = this.store.get<HarnessClaim>(claims, scope.workspaceId, runId);
    if (!claim || claim.generation !== generation || claim.expiresAt <= Date.now()) {
      throw new HarnessError('stale_claim', 'The writer claim is stale and cannot mutate this run.');
    }
  }

  append(
    input: { runId: string; type: HarnessJournalEntryType; step: number; data: Record<string, unknown> },
    generation: number,
    scope: HarnessScope,
  ): HarnessJournalEntry {
    return this.store.write(() => {
      this.assertClaim(input.runId, generation, scope);
      const stored = this.store.get<StoredJournal>(journals, scope.workspaceId, input.runId);
      if (!stored) throw new HarnessError('not_found', 'Harness journal not found.');
      const sequence = stored.entries.length + 1;
      const sourceEventId = stableSourceEventId(input.runId, sequence, input.type, input.data);
      const entry: HarnessJournalEntry = {
        id: `hje_${randomUUID()}`,
        sourceEventId,
        sequence,
        runId: input.runId,
        type: input.type,
        step: input.step,
        data: input.data,
        occurredAt: new Date().toISOString(),
      };
      stored.entries.push(entry);
      this.store.put(journals, scope.workspaceId, input.runId, stored);

      const admission = this.store.get<HarnessAdmission>(admissions, scope.workspaceId, `run:${input.runId}`);
      if (admission) {
        this.store.appendEvent(scope.workspaceId, {
          id: `evt_${randomUUID()}`,
          sessionId: admission.sessionId,
          runId: input.runId,
          type: `harness.${input.type}`,
          occurredAt: entry.occurredAt,
          data: { sourceEventId, sequence, step: input.step, ...input.data },
        });
      }
      return entry;
    });
  }

  read(runId: string, scope: HarnessScope): HarnessJournalEntry[] {
    return this.store.get<StoredJournal>(journals, scope.workspaceId, runId)?.entries ?? [];
  }

  getCheckpoint(runId: string, scope: HarnessScope): HarnessCheckpoint | null {
    return this.store.get<HarnessCheckpoint>(checkpoints, scope.workspaceId, runId);
  }

  saveCheckpoint(checkpoint: HarnessCheckpoint, generation: number, scope: HarnessScope): void {
    this.store.write(() => {
      this.assertClaim(checkpoint.runId, generation, scope);
      this.store.put(checkpoints, scope.workspaceId, checkpoint.runId, checkpoint);
    });
  }
}
