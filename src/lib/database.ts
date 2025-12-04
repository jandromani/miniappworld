import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { normalizeTokenIdentifier } from './tokenNormalization';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

export type WorldIdVerificationRecord = {
  nullifier_hash: string;
  wallet_address?: string;
  action: string;
  merkle_root?: string;
  verification_level?: string;
  user_id: string;
  created_at: string;
};

export type PaymentRecord = {
  payment_id: string;
  user_id: string;
  tournament_id?: string;
  reference: string;
  transaction_id?: string;
  token_address: string;
  token_amount: string;
  recipient_address?: string;
  status: PaymentStatus;
  type: 'quick_match' | 'tournament';
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  wallet_address?: string;
};

export type PaymentStatusHistoryRecord = {
  payment_id: string;
  old_status?: PaymentStatus;
  new_status: PaymentStatus;
  changed_at: string;
  reason?: string;
};

export type TournamentRecord = {
  tournament_id: string;
  name: string;
  buy_in_token: string;
  buy_in_amount: string;
  prize_pool: string;
  max_players: number;
  start_time: string;
  end_time: string;
  status: 'upcoming' | 'active' | 'finished';
  prize_distribution: number[];
  accepted_tokens: string[];
};

export type TournamentParticipantRecord = {
  tournament_id: string;
  user_id: string;
  payment_reference: string;
  joined_at: string;
  status: 'joined' | 'eliminated' | 'pending';
};

export type TournamentResultRecord = {
  tournament_id: string;
  user_id: string;
  score: number;
  rank?: number;
  prize?: string;
};

export type DatabaseShape = {
  world_id_verifications: WorldIdVerificationRecord[];
  payments: PaymentRecord[];
  payment_status_history: PaymentStatusHistoryRecord[];
  tournaments: TournamentRecord[];
  tournament_participants: TournamentParticipantRecord[];
  tournament_results: TournamentResultRecord[];
};

const DB_PATH = path.join(process.cwd(), 'data', 'database.json');

async function ensureDbFile(): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const emptyDb: DatabaseShape = {
        world_id_verifications: [],
        payments: [],
        payment_status_history: [],
        tournaments: [],
        tournament_participants: [],
        tournament_results: [],
      };
      await fs.writeFile(DB_PATH, JSON.stringify(emptyDb, null, 2), 'utf8');
    } else {
      throw error;
    }
  }
}

async function readDb(): Promise<DatabaseShape> {
  await ensureDbFile();
  const content = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(content) as DatabaseShape;
}

async function writeDb(db: DatabaseShape): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

export async function findWorldIdVerificationByNullifier(nullifier_hash: string) {
  const db = await readDb();
  return db.world_id_verifications.find((record) => record.nullifier_hash === nullifier_hash);
}

export async function findWorldIdVerificationByUser(user_id: string) {
  const db = await readDb();
  return db.world_id_verifications.find((record) => record.user_id === user_id);
}

export async function insertWorldIdVerification(record: Omit<WorldIdVerificationRecord, 'created_at'>) {
  const db = await readDb();
  const exists = db.world_id_verifications.find(
    (item) => item.nullifier_hash === record.nullifier_hash
  );

  if (exists) {
    const error = new Error('Duplicate nullifier_hash');
    (error as NodeJS.ErrnoException).code = 'DUPLICATE_NULLIFIER';
    throw error;
  }

  const entry: WorldIdVerificationRecord = {
    ...record,
    created_at: new Date().toISOString(),
  };

  db.world_id_verifications.push(entry);
  await writeDb(db);
  return entry;
}

export async function createPaymentRecord(
  record: Omit<PaymentRecord, 'payment_id' | 'status' | 'created_at' | 'updated_at'>
): Promise<PaymentRecord> {
  const db = await readDb();
  if (db.payments.find((payment) => payment.reference === record.reference)) {
    const error = new Error('Duplicate payment reference');
    (error as NodeJS.ErrnoException).code = 'DUPLICATE_REFERENCE';
    throw error;
  }

  const payment: PaymentRecord = {
    ...record,
    payment_id: randomUUID(),
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.payments.push(payment);
  db.payment_status_history.push({
    payment_id: payment.payment_id,
    old_status: undefined,
    new_status: 'pending',
    changed_at: payment.created_at,
    reason: 'Payment initiated',
  });

  await writeDb(db);
  return payment;
}

export async function findPaymentByReference(reference: string): Promise<PaymentRecord | undefined> {
  const db = await readDb();
  return db.payments.find((payment) => payment.reference === reference);
}

export async function updatePaymentStatus(
  reference: string,
  newStatus: PaymentStatus,
  options: { reason?: string; transaction_id?: string; confirmed_at?: string } = {}
): Promise<PaymentRecord | undefined> {
  const db = await readDb();
  const paymentIndex = db.payments.findIndex((payment) => payment.reference === reference);

  if (paymentIndex === -1) return undefined;

  const payment = db.payments[paymentIndex];
  const updated: PaymentRecord = {
    ...payment,
    status: newStatus,
    transaction_id: options.transaction_id ?? payment.transaction_id,
    confirmed_at: options.confirmed_at ?? payment.confirmed_at,
    updated_at: new Date().toISOString(),
  };

  db.payments[paymentIndex] = updated;
  db.payment_status_history.push({
    payment_id: payment.payment_id,
    old_status: payment.status,
    new_status: newStatus,
    changed_at: new Date().toISOString(),
    reason: options.reason,
  });

  await writeDb(db);
  return updated;
}

export async function recordTournament(tournament: TournamentRecord): Promise<void> {
  const db = await readDb();
  const index = db.tournaments.findIndex((entry) => entry.tournament_id === tournament.tournament_id);

  if (index >= 0) {
    db.tournaments[index] = tournament;
  } else {
    db.tournaments.push(tournament);
  }

  await writeDb(db);
}

export async function listTournamentRecords(): Promise<TournamentRecord[]> {
  const db = await readDb();
  return db.tournaments;
}

export async function findTournamentRecord(tournamentId: string): Promise<TournamentRecord | undefined> {
  const db = await readDb();
  return db.tournaments.find((entry) => entry.tournament_id === tournamentId);
}

export async function updateTournamentRecord(tournament: TournamentRecord): Promise<void> {
  const db = await readDb();
  const index = db.tournaments.findIndex((entry) => entry.tournament_id === tournament.tournament_id);
  if (index === -1) throw new Error('Tournament not found');
  db.tournaments[index] = tournament;
  await writeDb(db);
}

export async function addTournamentParticipant(
  participant: TournamentParticipantRecord
): Promise<TournamentParticipantRecord> {
  const db = await readDb();
  const exists = db.tournament_participants.find(
    (entry) => entry.tournament_id === participant.tournament_id && entry.user_id === participant.user_id
  );

  if (exists) {
    return exists;
  }

  db.tournament_participants.push(participant);
  await writeDb(db);
  return participant;
}

export async function listTournamentParticipants(tournamentId: string): Promise<TournamentParticipantRecord[]> {
  const db = await readDb();
  return db.tournament_participants.filter((entry) => entry.tournament_id === tournamentId);
}

export async function upsertTournamentResult(record: TournamentResultRecord): Promise<TournamentResultRecord> {
  const db = await readDb();
  const index = db.tournament_results.findIndex(
    (entry) => entry.tournament_id === record.tournament_id && entry.user_id === record.user_id
  );

  if (index >= 0) {
    db.tournament_results[index] = { ...db.tournament_results[index], ...record };
  } else {
    db.tournament_results.push(record);
  }

  await writeDb(db);
  return record;
}

export async function listTournamentResults(tournamentId: string): Promise<TournamentResultRecord[]> {
  const db = await readDb();
  return db.tournament_results.filter((entry) => entry.tournament_id === tournamentId);
}

export async function normalizeTournamentRecord(record: TournamentRecord): TournamentRecord {
  return {
    ...record,
    buy_in_token: normalizeTokenIdentifier(record.buy_in_token),
    accepted_tokens: record.accepted_tokens.map((token) => normalizeTokenIdentifier(token)),
  };
}
