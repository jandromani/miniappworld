import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_MAX_RETRIES = Number(process.env.DEV_PORTAL_MAX_RETRIES ?? 3);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.DEV_PORTAL_RETRY_DELAY_MS ?? 500);

const DEAD_LETTER_PATH =
  process.env.DEV_PORTAL_DEAD_LETTER_PATH ?? path.join(process.cwd(), 'data', 'developer-dead-letter.log');

type DeadLetterEntry = {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  payload?: unknown;
  headers?: Record<string, string>;
  status?: number;
  responseBody?: string;
  error?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDeadLetterDirectory() {
  await fs.mkdir(path.dirname(DEAD_LETTER_PATH), { recursive: true });
}

async function appendDeadLetter(entry: DeadLetterEntry) {
  try {
    await ensureDeadLetterDirectory();
    await fs.appendFile(DEAD_LETTER_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[developerPortalClient] No se pudo escribir en dead-letter queue', error);
  }
}

async function safeReadResponse(response: Response) {
  try {
    return await response.clone().text();
  } catch (error) {
    console.error('[developerPortalClient] No se pudo leer el cuerpo de respuesta', error);
    return 'unreadable_body';
  }
}

export async function performDeveloperRequest(
  requestFn: () => Promise<Response>,
  meta: { endpoint: string; method: string; payload?: unknown; headers?: Record<string, string> },
  options?: { maxRetries?: number; retryDelayMs?: number }
): Promise<{ response: Response }> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await requestFn();

      if (response.ok) {
        return { response };
      }

      if (attempt === maxRetries) {
        const responseBody = await safeReadResponse(response);
        await appendDeadLetter({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          endpoint: meta.endpoint,
          method: meta.method,
          payload: meta.payload,
          headers: meta.headers,
          status: response.status,
          responseBody,
          error: `Received status ${response.status}`,
        });
        return { response };
      }

      await delay(retryDelayMs);
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        await appendDeadLetter({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          endpoint: meta.endpoint,
          method: meta.method,
          payload: meta.payload,
          headers: meta.headers,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError ?? new Error('Unexpected developer API error');
}
