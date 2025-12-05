import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export type NotificationApiKey = {
  key: string;
  role?: string;
  revoked?: boolean;
  source?: 'notification' | 'developer_portal';
  createdAt?: string;
  revokedAt?: string;
  rotatedFrom?: string;
};

const DEFAULT_KEYS_PATH =
  process.env.NOTIFICATION_KEYS_PATH ?? path.join(process.cwd(), 'data', 'notification-keys.json');

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (error) {
    return false;
  }
}

function parseKeyArray(value: unknown): NotificationApiKey[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { key: item } satisfies NotificationApiKey;
      }

      if (item && typeof item === 'object' && typeof (item as NotificationApiKey).key === 'string') {
        return item as NotificationApiKey;
      }

      return undefined;
    })
    .filter((item): item is NotificationApiKey => Boolean(item));
}

function fallbackFromEnv(): NotificationApiKey[] {
  const values: NotificationApiKey[] = [];

  if (process.env.NOTIFICATIONS_API_KEY) {
    values.push({ key: process.env.NOTIFICATIONS_API_KEY, role: 'default', source: 'notification' });
  }

  if (process.env.NOTIFICATIONS_API_KEYS) {
    const entries = process.env.NOTIFICATIONS_API_KEYS.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    entries.forEach((key, index) => {
      values.push({ key, role: `key_${index + 1}`, source: 'notification' });
    });
  }

  if (process.env.DEV_PORTAL_API_KEY) {
    values.push({ key: process.env.DEV_PORTAL_API_KEY, role: 'developer_portal', source: 'developer_portal' });
  }

  return values;
}

async function ensureKeysFile(keys: NotificationApiKey[] = []) {
  await fs.mkdir(path.dirname(DEFAULT_KEYS_PATH), { recursive: true });
  await fs.writeFile(DEFAULT_KEYS_PATH, JSON.stringify({ keys }, null, 2), 'utf8');
}

async function readKeysFile(): Promise<NotificationApiKey[]> {
  try {
    const content = await fs.readFile(DEFAULT_KEYS_PATH, 'utf8');
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed?.keys)) {
      return parseKeyArray(parsed.keys);
    }

    return parseKeyArray(parsed);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      const fallback = fallbackFromEnv();
      await ensureKeysFile(fallback);
      return fallback;
    }

    console.error('[notificationApiKeys] No se pudo leer el archivo de claves', error);
    const fallback = fallbackFromEnv();
    await ensureKeysFile(fallback);
    return fallback;
  }
}

async function persistKeys(keys: NotificationApiKey[]) {
  await ensureKeysFile(keys);
}

export async function listAllNotificationApiKeys(includeRevoked = false): Promise<NotificationApiKey[]> {
  const keys = await readKeysFile();
  return includeRevoked ? keys : keys.filter((entry) => !entry.revoked);
}

export async function listNotificationApiKeys(): Promise<NotificationApiKey[]> {
  return listAllNotificationApiKeys(false);
}

export async function resolveNotificationApiKey(providedKey: string | null): Promise<NotificationApiKey | undefined> {
  if (!providedKey) return undefined;

  const keys = await listNotificationApiKeys();
  return keys.find((entry) => timingSafeEqual(entry.key, providedKey));
}

export function hashNotificationApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function rotateApiKey(source: 'notification' | 'developer_portal', role?: string) {
  const keys = await readKeysFile();
  const now = new Date().toISOString();
  const newKey = crypto.randomBytes(32).toString('hex');

  const rotatedKeys = keys.map((entry) =>
    entry.source === source && !entry.revoked
      ? { ...entry, revoked: true, revokedAt: now, rotatedFrom: entry.key }
      : entry
  );

  rotatedKeys.push({ key: newKey, role: role ?? source, source, createdAt: now });
  await persistKeys(rotatedKeys);

  return { newKey };
}

export async function revokeApiKey(key: string, reason?: string) {
  const keys = await readKeysFile();
  const updated = keys.map((entry) =>
    entry.key === key ? { ...entry, revoked: true, revokedAt: new Date().toISOString(), role: entry.role ?? reason } : entry
  );
  await persistKeys(updated);
}
