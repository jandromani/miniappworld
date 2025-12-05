import type { PaymentRecord, TournamentParticipantRecord, TournamentRecord } from '@/lib/database';

export type DatabaseDriverName = 'postgres' | 'sqlite';

export type DatabaseDriver = {
  name: DatabaseDriverName;
  startTransaction: () => Transaction;
  seed: (fixtures: DatabaseFixtures) => void;
  currentPayment: (reference: string) => PaymentRecord | undefined;
  participantsForTournament: (tournamentId: string) => TournamentParticipantRecord[];
};

export type DatabaseFixtures = {
  payments: PaymentRecord[];
  tournaments: TournamentRecord[];
};

type VersionedPayment = { record: PaymentRecord; version: number };
type VersionedParticipant = { record: TournamentParticipantRecord; version: number };
type Snapshot = {
  payments: Map<string, VersionedPayment>;
  participants: Map<string, VersionedParticipant>;
};

type TransactionContext = {
  driver: InMemoryDatabaseDriver;
  snapshot: Snapshot;
  dirtyPayments: Set<string>;
  dirtyParticipants: Set<string>;
};

export class InMemoryDatabaseDriver implements DatabaseDriver {
  private state: Snapshot;
  private lock: Promise<void> = Promise.resolve();
  private resolveLock: (() => void) | null = null;

  constructor(public readonly name: DatabaseDriverName) {
    this.state = { payments: new Map(), participants: new Map() };
  }

  seed(fixtures: DatabaseFixtures) {
    this.state = {
      payments: new Map(
        fixtures.payments.map((payment) => [payment.reference, { record: payment, version: 1 }])
      ),
      participants: new Map(),
    };
  }

  startTransaction(): Transaction {
    const snapshot: Snapshot = {
      payments: new Map(
        Array.from(this.state.payments.entries()).map(([reference, { record, version }]) => [
          reference,
          { record: structuredClone(record), version },
        ])
      ),
      participants: new Map(
        Array.from(this.state.participants.entries()).map(([key, { record, version }]) => [
          key,
          { record: structuredClone(record), version },
        ])
      ),
    };

    return new Transaction({
      driver: this,
      snapshot,
      dirtyParticipants: new Set<string>(),
      dirtyPayments: new Set<string>(),
    });
  }

  currentPayment(reference: string) {
    return this.state.payments.get(reference)?.record;
  }

  participantsForTournament(tournamentId: string) {
    return Array.from(this.state.participants.values())
      .map(({ record }) => record)
      .filter((participant) => participant.tournament_id === tournamentId);
  }

  async commit(ctx: TransactionContext) {
    await this.runWithLock(async () => {
      ctx.dirtyPayments.forEach((reference) => {
        const pending = ctx.snapshot.payments.get(reference);
        const current = this.state.payments.get(reference);
        if (!pending || !current) {
          throw new Error(`${this.name}: Payment missing on commit`);
        }

        if (current.version !== pending.version) {
          throw new Error(`${this.name}: Concurrent write detected for ${reference}`);
        }

        this.state.payments.set(reference, {
          record: pending.record,
          version: current.version + 1,
        });
      });

      ctx.dirtyParticipants.forEach((key) => {
        const pending = ctx.snapshot.participants.get(key);
        const current = this.state.participants.get(key);

        if (current && current.version !== pending?.version) {
          throw new Error(`${this.name}: Participant conflict for ${key}`);
        }

        if (!pending) {
          throw new Error(`${this.name}: Participant missing on commit`);
        }

        this.state.participants.set(key, {
          record: pending.record,
          version: (current?.version ?? 0) + 1,
        });
      });
    });
  }

  private async runWithLock<T>(operation: () => Promise<T>) {
    const previousLock = this.lock;
    this.lock = new Promise<void>((resolve) => {
      this.resolveLock = resolve;
    });

    await previousLock;

    try {
      return await operation();
    } finally {
      this.resolveLock?.();
      this.resolveLock = null;
    }
  }
}

export class Transaction {
  constructor(private readonly ctx: TransactionContext) {}

  readPayment(reference: string) {
    return this.ctx.snapshot.payments.get(reference)?.record;
  }

  confirmPayment(reference: string, details: { transactionId: string; walletAddress?: string }) {
    const payment = this.ctx.snapshot.payments.get(reference);
    if (!payment) {
      throw new Error(`Payment ${reference} not found in transaction`);
    }

    this.ctx.snapshot.payments.set(reference, {
      record: {
        ...payment.record,
        status: 'confirmed',
        transaction_id: details.transactionId,
        wallet_address: details.walletAddress ?? payment.record.wallet_address,
        updated_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      },
      version: payment.version,
    });

    this.ctx.dirtyPayments.add(reference);
  }

  enqueueParticipant(record: TournamentParticipantRecord) {
    const key = `${record.tournament_id}:${record.user_id}`;
    this.ctx.snapshot.participants.set(key, { record, version: 1 });
    this.ctx.dirtyParticipants.add(key);
  }

  rollback() {
    this.ctx.dirtyPayments.clear();
    this.ctx.dirtyParticipants.clear();
  }

  async commit() {
    await this.ctx.driver.commit(this.ctx);
  }
}

export function buildDriver(name: DatabaseDriverName): DatabaseDriver {
  return new InMemoryDatabaseDriver(name);
}

export function tournamentFixtures(): DatabaseFixtures {
  const createdAt = new Date('2024-01-01T00:00:00.000Z').toISOString();
  const updatedAt = new Date('2024-01-01T00:05:00.000Z').toISOString();

  const payments: PaymentRecord[] = [
    {
      payment_id: 'pay-001',
      user_id: 'user-001',
      tournament_id: 't-main',
      reference: 'pay-ref-001',
      transaction_id: undefined,
      token_address: '0xWLD',
      token_amount: '1',
      recipient_address: '0xRECIPIENT',
      status: 'pending',
      type: 'tournament',
      created_at: createdAt,
      updated_at: updatedAt,
      wallet_address: '0xUSER',
      session_token: 'session-1',
      nullifier_hash: 'nullifier-1',
    },
    {
      payment_id: 'pay-002',
      user_id: 'user-002',
      tournament_id: 't-main',
      reference: 'pay-ref-002',
      transaction_id: undefined,
      token_address: '0xWLD',
      token_amount: '1',
      recipient_address: '0xRECIPIENT',
      status: 'pending',
      type: 'tournament',
      created_at: createdAt,
      updated_at: updatedAt,
      wallet_address: '0xUSER2',
      session_token: 'session-2',
      nullifier_hash: 'nullifier-2',
    },
  ];

  const tournaments: TournamentRecord[] = [
    {
      tournament_id: 't-main',
      name: 'Main',
      buy_in_token: '0xWLD',
      buy_in_amount: '1',
      prize_pool: '10',
      max_players: 128,
      start_time: createdAt,
      end_time: new Date('2024-01-02T00:00:00.000Z').toISOString(),
      status: 'active',
      prize_distribution: [60, 30, 10],
      accepted_tokens: ['0xWLD'],
    },
  ];

  return { payments, tournaments };
}
