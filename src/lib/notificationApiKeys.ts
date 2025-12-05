import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export type NotificationApiKey = {
  key: string;
  role?: string;
  revoked?: boolean;
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
    values.push({ key: process.env.NOTIFICATIONS_API_KEY, role: 'default' });
  }

  if (process.env.NOTIFICATIONS_API_KEYS) {
    const entries = process.env.NOTIFICATIONS_API_KEYS.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    entries.forEach((key, index) => {
      values.push({ key, role: `key_${index + 1}` });
    });
  }

  return values;
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
      return fallbackFromEnv();
    }

    console.error('[notificationApiKeys] No se pudo leer el archivo de claves', error);
    return fallbackFromEnv();
  }
}

export async function listNotificationApiKeys(): Promise<NotificationApiKey[]> {
  const keys = await readKeysFile();
  return keys.filter((entry) => !entry.revoked);
}

export async function resolveNotificationApiKey(providedKey: string | null): Promise<NotificationApiKey | undefined> {
  if (!providedKey) return undefined;

  const keys = await listNotificationApiKeys();
  return keys.find((entry) => timingSafeEqual(entry.key, providedKey));
}

export function hashNotificationApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
