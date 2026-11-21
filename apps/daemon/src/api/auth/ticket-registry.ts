import crypto from "node:crypto";

export interface TicketEntry {
  createdAt: number;
  expiresAt: number;
}

export class PairingTicketRegistry {
  private readonly tickets = new Map<string, TicketEntry>();
  private readonly ttlMs: number;
  private readonly maxCapacity: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(options: { ttlMs?: number; maxCapacity?: number; sweepIntervalMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 60_000; // 60s TTL
    this.maxCapacity = options.maxCapacity ?? 1_000;

    const sweepInterval = options.sweepIntervalMs ?? 30_000; // 30s sweep
    this.sweepTimer = setInterval(() => {
      this.sweepExpired();
    }, sweepInterval);
    // Don't keep Node process alive solely for background sweep
    if (this.sweepTimer.unref) {
      this.sweepTimer.unref();
    }
  }

  /**
   * Generates a single-use, high-entropy pairing ticket.
   */
  createTicket(): string {
    if (this.tickets.size >= this.maxCapacity) {
      this.sweepExpired();
      if (this.tickets.size >= this.maxCapacity) {
        throw new Error("Pairing ticket registry capacity exceeded");
      }
    }

    const ticket = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    this.tickets.set(ticket, {
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });
    return ticket;
  }

  /**
   * Atomically consumes a ticket via synchronous delete-on-read.
   * Exactly one concurrent caller can succeed per ticket.
   * Returns true if valid and active, false if missing, replayed, or expired.
   */
  consumeTicket(ticket: string): boolean {
    if (!ticket || typeof ticket !== "string" || ticket.length !== 64) {
      return false;
    }

    // Synchronous delete-on-read ensures atomic single-use semantics
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);

    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Periodic memory housekeeping.
   */
  sweepExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [ticket, entry] of this.tickets.entries()) {
      if (now > entry.expiresAt) {
        this.tickets.delete(ticket);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Diagnostic / inspection helper
   */
  size(): number {
    return this.tickets.size;
  }

  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.tickets.clear();
  }
}
