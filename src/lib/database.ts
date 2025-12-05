import { randomUUID } from 'crypto';
import fs, { FileHandle } from 'fs/promises';
import path from 'path';
import { normalizeTokenIdentifier } from './tokenNormalization';
import type { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

export type WorldIdVerificationRecord = {
  nullifier_hash: string;
  wallet_address?: string;
  action: string;
  merkle_root?: string;
  verification_level?: string;
  user_id: string;
  session_token: string;
  created_at: string;
  expires_at: string;
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
  nullifier_hash?: string;
  session_token?: string;
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

export type GameProgressRecord = {
  progress_id: string;
  session_id: string;
  user_id: string;
  mode: 'quick' | 'tournament';
  tournament_id?: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  session_token?: string;
  created_at: string;
  updated_at: string;
};

export type DatabaseShape = {
  world_id_verifications: WorldIdVerificationRecord[];
  payments: PaymentRecord[];
  payment_status_history: PaymentStatusHistoryRecord[];
  tournaments: TournamentRecord[];
  tournament_participants: TournamentParticipantRecord[];
  tournament_results: TournamentResultRecord[];
  game_progress: GameProgressRecord[];
};

const DATA_ROOT = process.env.STATE_DIRECTORY ?? path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_ROOT, 'database.json');
const LOCK_PATH = path.join(DATA_ROOT, 'database.lock');
const AUDIT_LOG_PATH = path.join(DATA_ROOT, 'audit.log');
const DB_PATH = path.join(process.cwd(), 'data', 'database.json');
const LOCK_PATH = path.join(process.cwd(), 'data', 'database.lock');
const AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'audit.log');
const AUDIT_LOG_MAX_SIZE_BYTES = Number(process.env.AUDIT_LOG_MAX_SIZE_BYTES ?? 5 * 1024 * 1024);
const AUDIT_LOG_ROTATE_DAILY = process.env.AUDIT_LOG_ROTATE_DAILY !== 'false';
const AUDIT_LOG_HTTP_ENDPOINT = process.env.AUDIT_LOG_HTTP_ENDPOINT;
const AUDIT_LOG_HTTP_AUTHORIZATION = process.env.AUDIT_LOG_HTTP_AUTHORIZATION;
const AUDIT_LOG_FORWARD_TIMEOUT_MS = Number(process.env.AUDIT_LOG_FORWARD_TIMEOUT_MS ?? 4000);
const AUDIT_LOG_CLOUDWATCH_GROUP = process.env.AUDIT_LOG_CLOUDWATCH_GROUP;
const AUDIT_LOG_CLOUDWATCH_STREAM = process.env.AUDIT_LOG_CLOUDWATCH_STREAM ?? 'miniapp-audit';
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 75;
const LOCK_MAX_AGE_MS = 10_000; // 10 segundos
const WORLD_ID_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function assertPersistentStorageAvailable() {
  if (process.env.DISABLE_LOCAL_STATE === 'true') {
    const error = new Error('El almacenamiento local está deshabilitado. Configure un directorio compartido.');
    (error as NodeJS.ErrnoException).code = 'LOCAL_STORAGE_DISABLED';
    throw error;
  }
}
let cloudWatchClient: CloudWatchLogsClient | undefined;
let cloudWatchSequenceToken: string | undefined;
type CachedVerification = {
  record: WorldIdVerificationRecord;
  expiresAt: number;
};

const worldIdCacheByNullifier = new Map<string, CachedVerification>();
const worldIdCacheBySession = new Map<string, CachedVerification>();
const worldIdCacheByUser = new Map<string, CachedVerification>();

export type AuditContext = { userId?: string; sessionId?: string; skipUserValidation?: boolean };
export type AuditLogEntry = {
  timestamp: string;
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  sessionId?: string;
  status: 'success' | 'error';
  details?: Record<string, unknown>;
};

export function isLocalStorageDisabled(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === 'LOCAL_STORAGE_DISABLED';
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(operation: () => Promise<T>, attempts = RETRY_ATTEMPTS): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

async function acquireLock(attempts = RETRY_ATTEMPTS): Promise<FileHandle> {
  assertPersistentStorageAvailable();

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
      return await fs.open(LOCK_PATH, 'wx');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      lastError = error;
      if (code !== 'EEXIST' && code !== 'EACCES') {
        break;
      }

      try {
        const stats = await fs.stat(LOCK_PATH);
        const ageMs = Date.now() - stats.mtimeMs;

        if (ageMs > LOCK_MAX_AGE_MS) {
          console.warn(
            `[database] Lockfile obsoleto detectado (edad: ${ageMs}ms). Intentando recuperación...`
          );
          await releaseLock();
          continue;
        }
      } catch (statError) {
        const statCode = (statError as NodeJS.ErrnoException).code;
        if (statCode !== 'ENOENT') {
          console.error('[database] No se pudo verificar la edad del lockfile', statError);
        }
      }

      await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

async function releaseLock(handle?: FileHandle) {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error('[database] Error al liberar lockfile', error);
    }
  }

  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      console.error('[database] Error al cerrar lockfile', error);
    }
  }
}

async function withDbLock<T>(operation: () => Promise<T>): Promise<T> {
  const lock = await acquireLock();
  try {
    return await operation();
  } finally {
    await releaseLock(lock);
  }
}

function isSameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function rotateAuditLogIfNeeded() {
  try {
    const stats = await fs.stat(AUDIT_LOG_PATH);
    const now = new Date();
    const sizeExceeded = stats.size >= AUDIT_LOG_MAX_SIZE_BYTES;
    const dayChanged = AUDIT_LOG_ROTATE_DAILY && !isSameUtcDay(now, new Date(stats.mtime));

    if (!sizeExceeded && !dayChanged) {
      return;
    }

    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const rotatedPath = path.join(
      path.dirname(AUDIT_LOG_PATH),
      `${path.basename(AUDIT_LOG_PATH, '.log')}-${timestamp}.log`
    );

    await withRetries(() => fs.rename(AUDIT_LOG_PATH, rotatedPath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error('[database] No se pudo rotar audit.log', error);
    }
  }
}

async function forwardAuditLogToHttp(entry: AuditLogEntry) {
  if (!AUDIT_LOG_HTTP_ENDPOINT) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUDIT_LOG_FORWARD_TIMEOUT_MS);

  try {
    await fetch(AUDIT_LOG_HTTP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AUDIT_LOG_HTTP_AUTHORIZATION ? { Authorization: AUDIT_LOG_HTTP_AUTHORIZATION } : {}),
      },
      body: JSON.stringify(entry),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[database] No se pudo reenviar auditoría (HTTP)', error);
  } finally {
    clearTimeout(timeout);
  }
}

async function forwardAuditLogToCloudWatch(entry: AuditLogEntry) {
  if (!AUDIT_LOG_CLOUDWATCH_GROUP) return;

  const {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    CreateLogStreamCommand,
    DescribeLogStreamsCommand,
    PutLogEventsCommand,
  } = await import('@aws-sdk/client-cloudwatch-logs');

  cloudWatchClient ??= new CloudWatchLogsClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  try {
    await cloudWatchClient.send(new CreateLogGroupCommand({ logGroupName: AUDIT_LOG_CLOUDWATCH_GROUP }));
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceAlreadyExistsException') {
      console.error('[database] CloudWatch: error creando log group', error);
      return;
    }
  }

  try {
    await cloudWatchClient.send(
      new CreateLogStreamCommand({
        logGroupName: AUDIT_LOG_CLOUDWATCH_GROUP,
        logStreamName: AUDIT_LOG_CLOUDWATCH_STREAM,
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceAlreadyExistsException') {
      console.error('[database] CloudWatch: error creando log stream', error);
      return;
    }
  }

  if (!cloudWatchSequenceToken) {
    try {
      const describe = await cloudWatchClient.send(
        new DescribeLogStreamsCommand({
          logGroupName: AUDIT_LOG_CLOUDWATCH_GROUP,
          logStreamNamePrefix: AUDIT_LOG_CLOUDWATCH_STREAM,
          limit: 1,
        })
      );
      const stream = describe.logStreams?.find((item) => item.logStreamName === AUDIT_LOG_CLOUDWATCH_STREAM);
      cloudWatchSequenceToken = stream?.uploadSequenceToken;
    } catch (error) {
      console.error('[database] CloudWatch: error obteniendo sequenceToken', error);
      return;
    }
  }

  try {
    const response = await cloudWatchClient.send(
      new PutLogEventsCommand({
        logGroupName: AUDIT_LOG_CLOUDWATCH_GROUP,
        logStreamName: AUDIT_LOG_CLOUDWATCH_STREAM,
        logEvents: [{
          message: JSON.stringify(entry),
          timestamp: Date.now(),
        }],
        sequenceToken: cloudWatchSequenceToken,
      })
    );
    cloudWatchSequenceToken = response.nextSequenceToken ?? cloudWatchSequenceToken;
  } catch (error) {
    console.error('[database] CloudWatch: error enviando evento', error);
  }
}

async function forwardAuditLog(entry: AuditLogEntry) {
  await Promise.allSettled([forwardAuditLogToHttp(entry), forwardAuditLogToCloudWatch(entry)]);
}

async function appendAuditLog(entry: AuditLogEntry) {
  assertPersistentStorageAvailable();

  const line = `${JSON.stringify(entry)}\n`;
  try {
    await fs.mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    await rotateAuditLogIfNeeded();
    await withRetries(() => fs.appendFile(AUDIT_LOG_PATH, line, 'utf8'));
    await forwardAuditLog(entry);
  } catch (error) {
    console.error('[database] No se pudo registrar auditoría', error);
  }
}

export async function recordAuditEvent(event: Omit<AuditLogEntry, 'timestamp'>) {
  await appendAuditLog({ ...event, timestamp: new Date().toISOString() });
}

async function ensureDbFile(): Promise<void> {
  assertPersistentStorageAvailable();

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
        game_progress: [],
      };
      await fs.writeFile(DB_PATH, JSON.stringify(emptyDb, null, 2), 'utf8');
    } else {
      throw error;
    }
  }
}

async function loadDb(): Promise<DatabaseShape> {
  assertPersistentStorageAvailable();

  await ensureDbFile();
  const content = await withRetries(() => fs.readFile(DB_PATH, 'utf8'));
  const parsed = JSON.parse(content) as Partial<DatabaseShape>;
  return {
    world_id_verifications: parsed.world_id_verifications ?? [],
    payments: parsed.payments ?? [],
    payment_status_history: parsed.payment_status_history ?? [],
    tournaments: parsed.tournaments ?? [],
    tournament_participants: parsed.tournament_participants ?? [],
    tournament_results: parsed.tournament_results ?? [],
    game_progress: parsed.game_progress ?? [],
  } satisfies DatabaseShape;
}

async function persistDb(db: DatabaseShape): Promise<void> {
  assertPersistentStorageAvailable();

  const tempPath = `${DB_PATH}.tmp`;

  await withRetries(async () => {
    await fs.writeFile(tempPath, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tempPath, DB_PATH);
  });
}

function isWorldIdVerificationExpired(record: WorldIdVerificationRecord, now: number) {
  if (!record.expires_at) return false;
  return new Date(record.expires_at).getTime() <= now;
}

function purgeExpiredWorldIdVerifications(db: DatabaseShape, now: number) {
  const before = db.world_id_verifications.length;
  db.world_id_verifications = db.world_id_verifications.filter(
    (record) => !isWorldIdVerificationExpired(record, now)
  );
  return before - db.world_id_verifications.length;
}

function cacheWorldIdVerification(record: WorldIdVerificationRecord) {
  const expiresAt = new Date(record.expires_at ?? Date.now() + WORLD_ID_SESSION_TTL_MS).getTime();
  const cached: CachedVerification = { record, expiresAt };

  worldIdCacheByNullifier.set(record.nullifier_hash, cached);
  worldIdCacheBySession.set(record.session_token, cached);
  worldIdCacheByUser.set(record.user_id, cached);
}

function getCachedWorldIdVerification(
  map: Map<string, CachedVerification>,
  key: string,
  now: number
) {
  const cached = map.get(key);
  if (!cached) return undefined;

  if (cached.expiresAt <= now) {
    worldIdCacheByNullifier.delete(cached.record.nullifier_hash);
    worldIdCacheBySession.delete(cached.record.session_token);
    worldIdCacheByUser.delete(cached.record.user_id);
    return undefined;
  }

  return cached.record;
}

function purgeWorldIdCaches(now: number) {
  for (const [key, cached] of worldIdCacheByNullifier.entries()) {
    if (cached.expiresAt <= now) {
      worldIdCacheByNullifier.delete(key);
      worldIdCacheBySession.delete(cached.record.session_token);
      worldIdCacheByUser.delete(cached.record.user_id);
    }
  }

  for (const [key, cached] of worldIdCacheBySession.entries()) {
    if (cached.expiresAt <= now) {
      worldIdCacheBySession.delete(key);
      worldIdCacheByNullifier.delete(cached.record.nullifier_hash);
      worldIdCacheByUser.delete(cached.record.user_id);
    }
  }

  for (const [key, cached] of worldIdCacheByUser.entries()) {
    if (cached.expiresAt <= now) {
      worldIdCacheByUser.delete(key);
      worldIdCacheByNullifier.delete(cached.record.nullifier_hash);
      worldIdCacheBySession.delete(cached.record.session_token);
    }
  }
}

async function withWorldIdCleanupSnapshot<T>(
  operation: (db: DatabaseShape, now: number) => T | Promise<T>
): Promise<T> {
  return withDbLock(async () => {
    const db = await loadDb();
    const now = Date.now();
    const removed = purgeExpiredWorldIdVerifications(db, now);
    purgeWorldIdCaches(now);
    const result = await operation(db, now);

    if (removed > 0) {
      await persistDb(db);
    }

    return result;
  });
}

export async function cleanupExpiredWorldIdVerifications(): Promise<number> {
  return withDbLock(async () => {
    const db = await loadDb();
    const now = Date.now();
    const removed = purgeExpiredWorldIdVerifications(db, now);
    purgeWorldIdCaches(now);

    if (removed > 0) {
      await persistDb(db);
    }

    return removed;
  });
}

async function withDbTransaction<T>(operation: (db: DatabaseShape) => Promise<T>): Promise<T> {
  return withDbLock(async () => {
    const db = await loadDb();
    const result = await operation(db);
    await persistDb(db);
    return result;
  });
}

async function withDbSnapshot<T>(operation: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
  return withDbLock(async () => {
    const db = await loadDb();
    return operation(db);
  });
}

function assertTournamentExists(db: DatabaseShape, tournamentId: string) {
  const tournament = db.tournaments.find((entry) => entry.tournament_id === tournamentId);
  if (!tournament) {
    const error = new Error('Tournament not found');
    (error as NodeJS.ErrnoException).code = 'TOURNAMENT_NOT_FOUND';
    throw error;
  }
  return tournament;
}

function assertUserExists(
  db: DatabaseShape,
  userId?: string,
  context?: AuditContext,
  walletAddress?: string,
) {
  if (!userId || userId === 'anonymous' || context?.skipUserValidation) return;

  const now = Date.now();
  const record = db.world_id_verifications.find(
    (entry) => entry.user_id === userId && !isWorldIdVerificationExpired(entry, now)
  );

  if (!record) {
    const error = new Error('User not found');
    (error as NodeJS.ErrnoException).code = 'USER_NOT_FOUND';
    throw error;
  }

  if (walletAddress && record.wallet_address) {
    const matches = walletAddress.toLowerCase() === record.wallet_address.toLowerCase();
    if (!matches) {
      const error = new Error('User wallet does not match registered wallet');
      (error as NodeJS.ErrnoException).code = 'USER_WALLET_MISMATCH';
      throw error;
    }
  }
}

export async function findWorldIdVerificationByNullifier(nullifier_hash: string) {
  return withWorldIdCleanupSnapshot((db, now) => {
    const cached = getCachedWorldIdVerification(worldIdCacheByNullifier, nullifier_hash, now);
    if (cached) return cached;

    const record = db.world_id_verifications.find((entry) => entry.nullifier_hash === nullifier_hash);
    if (record) cacheWorldIdVerification(record);

    return record;
  });
}

export async function findWorldIdVerificationByUser(user_id: string) {
  return withWorldIdCleanupSnapshot((db, now) => {
    const cached = getCachedWorldIdVerification(worldIdCacheByUser, user_id, now);
    if (cached) return cached;

    const record = db.world_id_verifications.find((entry) => entry.user_id === user_id);
    if (record) cacheWorldIdVerification(record);

    return record;
  });
}

export async function insertWorldIdVerification(
  record: Omit<WorldIdVerificationRecord, 'created_at' | 'expires_at'>,
  context: AuditContext = {}
) {
  const entry = await withDbTransaction(async (db) => {
    const now = Date.now();
    purgeExpiredWorldIdVerifications(db, now);

    const exists = db.world_id_verifications.find(
      (item) => item.nullifier_hash === record.nullifier_hash
    );

    if (exists) {
      const error = new Error('Duplicate nullifier_hash');
      (error as NodeJS.ErrnoException).code = 'DUPLICATE_NULLIFIER';
      throw error;
    }

    const created: WorldIdVerificationRecord = {
      ...record,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + WORLD_ID_SESSION_TTL_MS).toISOString(),
    };

    db.world_id_verifications.push(created);
    cacheWorldIdVerification(created);
    return created;
  });

  await appendAuditLog({
    action: 'insert_world_id_verification',
    entity: 'world_id_verifications',
    entityId: entry.nullifier_hash,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? entry.user_id,
    sessionId: context.sessionId,
    status: 'success',
  });

  return entry;
}

export async function findWorldIdVerificationBySession(session_token: string) {
  return withWorldIdCleanupSnapshot((db, now) => {
    const cached = getCachedWorldIdVerification(worldIdCacheBySession, session_token, now);
    if (cached) return cached;

    const record = db.world_id_verifications.find((entry) => entry.session_token === session_token);
    if (record) cacheWorldIdVerification(record);

    return record;
  });
}

export async function updateWorldIdWallet(
  user_id: string,
  wallet_address: string,
  context: AuditContext = {}
): Promise<WorldIdVerificationRecord> {
  const updatedRecord = await withDbTransaction(async (db) => {
    const now = Date.now();
    purgeExpiredWorldIdVerifications(db, now);

    const recordIndex = db.world_id_verifications.findIndex(
      (record) => record.user_id === user_id && !isWorldIdVerificationExpired(record, now)
    );

    if (recordIndex === -1) {
      const error = new Error('World ID verification not found for user');
      (error as NodeJS.ErrnoException).code = 'USER_NOT_FOUND';
      throw error;
    }

    const record = db.world_id_verifications[recordIndex];
    const updated: WorldIdVerificationRecord = { ...record, wallet_address };
    db.world_id_verifications[recordIndex] = updated;

    return updated;
  });

  await appendAuditLog({
    action: 'update_world_id_wallet',
    entity: 'world_id_verifications',
    entityId: updatedRecord.nullifier_hash,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? user_id,
    sessionId: context.sessionId,
    status: 'success',
    details: { wallet_address },
  });

  return updatedRecord;
}

export async function createPaymentRecord(
  record: Omit<PaymentRecord, 'payment_id' | 'status' | 'created_at' | 'updated_at'>,
  context: AuditContext = {}
): Promise<PaymentRecord> {
  const payment = await withDbTransaction(async (db) => {
    if (db.payments.find((existing) => existing.reference === record.reference)) {
      const error = new Error('Duplicate payment reference');
      (error as NodeJS.ErrnoException).code = 'DUPLICATE_REFERENCE';
      throw error;
    }

    if (record.type === 'tournament' && record.tournament_id) {
      assertTournamentExists(db, record.tournament_id);
    }

    assertUserExists(db, record.user_id, context, record.wallet_address);

    const created: PaymentRecord = {
      ...record,
      payment_id: randomUUID(),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.payments.push(created);
    db.payment_status_history.push({
      payment_id: created.payment_id,
      old_status: undefined,
      new_status: 'pending',
      changed_at: created.created_at,
      reason: 'Payment initiated',
    });

    return created;
  });

  await appendAuditLog({
    action: 'create_payment',
    entity: 'payments',
    entityId: payment.payment_id,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? payment.user_id,
    sessionId: context.sessionId,
    status: 'success',
    details: { reference: payment.reference, type: payment.type },
  });

  return payment;
}

export async function findPaymentByReference(reference: string): Promise<PaymentRecord | undefined> {
  return withDbSnapshot((db) => db.payments.find((payment) => payment.reference === reference));
}

export async function updatePaymentStatus(
  reference: string,
  newStatus: PaymentStatus,
  options: { reason?: string; transaction_id?: string; confirmed_at?: string } = {},
  context: AuditContext = {}
): Promise<PaymentRecord | undefined> {
  const { payment, updated } = await withDbTransaction(async (db) => {
    const paymentIndex = db.payments.findIndex((entry) => entry.reference === reference);

    if (paymentIndex === -1) return { payment: undefined, updated: undefined };

    const existing = db.payments[paymentIndex];

    const next: PaymentRecord = {
      ...existing,
      status: newStatus,
      transaction_id: options.transaction_id ?? existing.transaction_id,
      confirmed_at: options.confirmed_at ?? existing.confirmed_at,
      updated_at: new Date().toISOString(),
    };

    db.payments[paymentIndex] = next;
    db.payment_status_history.push({
      payment_id: existing.payment_id,
      old_status: existing.status,
      new_status: newStatus,
      changed_at: new Date().toISOString(),
      reason: options.reason,
    });

    return { payment: existing, updated: next };
  });

  if (payment && updated) {
    await appendAuditLog({
      action: 'update_payment_status',
      entity: 'payments',
      entityId: payment.payment_id,
      timestamp: new Date().toISOString(),
      userId: context.userId ?? payment.user_id,
      sessionId: context.sessionId,
      status: 'success',
      details: { reference, oldStatus: payment.status, newStatus },
    });
  }

  return updated;
}

export async function recordTournament(tournament: TournamentRecord): Promise<void> {
  await withDbTransaction(async (db) => {
    const index = db.tournaments.findIndex((entry) => entry.tournament_id === tournament.tournament_id);

    if (index >= 0) {
      db.tournaments[index] = tournament;
    } else {
      db.tournaments.push(tournament);
    }
  });

  await appendAuditLog({
    action: 'upsert_tournament',
    entity: 'tournaments',
    entityId: tournament.tournament_id,
    timestamp: new Date().toISOString(),
    status: 'success',
  });
}

export async function listTournamentRecords(): Promise<TournamentRecord[]> {
  return withDbSnapshot((db) => db.tournaments);
}

export async function findTournamentRecord(tournamentId: string): Promise<TournamentRecord | undefined> {
  return withDbSnapshot((db) => db.tournaments.find((entry) => entry.tournament_id === tournamentId));
}

export async function updateTournamentRecord(tournament: TournamentRecord): Promise<void> {
  await withDbTransaction(async (db) => {
    const index = db.tournaments.findIndex((entry) => entry.tournament_id === tournament.tournament_id);
    if (index === -1) throw new Error('Tournament not found');
    db.tournaments[index] = tournament;
  });

  await appendAuditLog({
    action: 'update_tournament',
    entity: 'tournaments',
    entityId: tournament.tournament_id,
    timestamp: new Date().toISOString(),
    status: 'success',
  });
}

export async function addTournamentParticipant(
  participant: TournamentParticipantRecord,
  context: AuditContext = {},
  options: { walletAddress?: string } = {}
): Promise<TournamentParticipantRecord> {
  const entry = await withDbTransaction(async (db) => {
    assertTournamentExists(db, participant.tournament_id);
    assertUserExists(db, participant.user_id, context, options.walletAddress);

    const exists = db.tournament_participants.find(
      (item) => item.tournament_id === participant.tournament_id && item.user_id === participant.user_id
    );

    if (exists) {
      return exists;
    }

    db.tournament_participants.push(participant);
    return participant;
  });

  await appendAuditLog({
    action: 'add_tournament_participant',
    entity: 'tournament_participants',
    entityId: `${participant.tournament_id}:${participant.user_id}`,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? participant.user_id,
    sessionId: context.sessionId,
    status: 'success',
  });

  return entry;
}

export async function listTournamentParticipants(tournamentId: string): Promise<TournamentParticipantRecord[]> {
  return withDbSnapshot((db) =>
    db.tournament_participants.filter((entry) => entry.tournament_id === tournamentId)
  );
}

export async function upsertTournamentResult(
  record: TournamentResultRecord,
  context: AuditContext = {}
): Promise<TournamentResultRecord> {
  const result = await withDbTransaction(async (db) => {
    assertTournamentExists(db, record.tournament_id);
    assertUserExists(db, record.user_id, context);

    const index = db.tournament_results.findIndex(
      (entry) => entry.tournament_id === record.tournament_id && entry.user_id === record.user_id
    );

    if (index >= 0) {
      db.tournament_results[index] = { ...db.tournament_results[index], ...record };
    } else {
      db.tournament_results.push(record);
    }

    return record;
  });

  await appendAuditLog({
    action: 'upsert_tournament_result',
    entity: 'tournament_results',
    entityId: `${record.tournament_id}:${record.user_id}`,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? record.user_id,
    sessionId: context.sessionId,
    status: 'success',
  });

  return result;
}

export async function updateTournamentResultAndPool(
  tournamentId: string,
  result: Omit<TournamentResultRecord, 'tournament_id'>,
  context: AuditContext = {}
): Promise<{ tournament: TournamentRecord; result: TournamentResultRecord }> {
  const outcome = await withDbTransaction(async (db) => {
    const tournamentIndex = db.tournaments.findIndex(
      (entry) => entry.tournament_id === tournamentId
    );
    if (tournamentIndex === -1) {
      const error = new Error('Tournament not found');
      (error as NodeJS.ErrnoException).code = 'TOURNAMENT_NOT_FOUND';
      throw error;
    }

    assertUserExists(db, result.user_id, context);

    const tournament = db.tournaments[tournamentIndex];
    const updatedTournament: TournamentRecord = {
      ...tournament,
      prize_pool: (
        BigInt(tournament.prize_pool ?? '0') + BigInt(tournament.buy_in_amount)
      ).toString(),
    };

    db.tournaments[tournamentIndex] = updatedTournament;

    const nextResult: TournamentResultRecord = {
      tournament_id: tournamentId,
      ...result,
    };

    const resultIndex = db.tournament_results.findIndex(
      (entry) => entry.tournament_id === tournamentId && entry.user_id === result.user_id
    );

    if (resultIndex >= 0) {
      db.tournament_results[resultIndex] = {
        ...db.tournament_results[resultIndex],
        ...nextResult,
      };
    } else {
      db.tournament_results.push(nextResult);
    }

    return { tournament: updatedTournament, result: nextResult };
  });

  await appendAuditLog({
    action: 'upsert_tournament',
    entity: 'tournaments',
    entityId: tournamentId,
    timestamp: new Date().toISOString(),
    status: 'success',
  });

  await appendAuditLog({
    action: 'upsert_tournament_result',
    entity: 'tournament_results',
    entityId: `${tournamentId}:${outcome.result.user_id}`,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? outcome.result.user_id,
    sessionId: context.sessionId,
    status: 'success',
  });

  return outcome;
}

export async function listTournamentResults(tournamentId: string): Promise<TournamentResultRecord[]> {
  return withDbSnapshot((db) =>
    db.tournament_results.filter((entry) => entry.tournament_id === tournamentId)
  );
}

export async function upsertGameProgress(
  record: Omit<GameProgressRecord, 'progress_id' | 'created_at' | 'updated_at'>,
  context: AuditContext = {}
): Promise<GameProgressRecord> {
  const entry = await withDbTransaction(async (db) => {
    assertUserExists(db, record.user_id, context);

    const now = new Date().toISOString();
    const existingIndex = db.game_progress.findIndex(
      (item) => item.session_id === record.session_id && item.user_id === record.user_id
    );

    if (existingIndex >= 0) {
      const updated: GameProgressRecord = {
        ...db.game_progress[existingIndex],
        ...record,
        updated_at: now,
      };
      db.game_progress[existingIndex] = updated;
      return updated;
    }

    const created: GameProgressRecord = {
      ...record,
      progress_id: randomUUID(),
      created_at: now,
      updated_at: now,
    };
    db.game_progress.push(created);
    return created;
  });

  await appendAuditLog({
    action: 'upsert_game_progress',
    entity: 'game_progress',
    entityId: entry.progress_id,
    timestamp: new Date().toISOString(),
    userId: context.userId ?? entry.user_id,
    sessionId: context.sessionId,
    status: 'success',
    details: {
      mode: entry.mode,
      score: entry.score,
      tournamentId: entry.tournament_id,
    },
  });

  return entry;
}

export async function listGameProgressByUser(userId: string): Promise<GameProgressRecord[]> {
  return withDbSnapshot((db) => db.game_progress.filter((entry) => entry.user_id === userId));
}

export async function normalizeTournamentRecord(record: TournamentRecord): TournamentRecord {
  return {
    ...record,
    buy_in_token: normalizeTokenIdentifier(record.buy_in_token),
    accepted_tokens: record.accepted_tokens.map((token) => normalizeTokenIdentifier(token)),
  };
}
