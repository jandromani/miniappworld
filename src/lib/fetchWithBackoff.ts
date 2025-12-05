const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_INITIAL_DELAY_MS = 300;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

export type FetchWithBackoffOptions = RequestInit & {
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  retryOnStatuses?: number[];
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithBackoff(url: string, options: FetchWithBackoffOptions = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    backoffFactor = DEFAULT_BACKOFF_FACTOR,
    retryOnStatuses = DEFAULT_RETRY_STATUSES,
    ...fetchOptions
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout exceeded')), timeoutMs);

    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

      if (!retryOnStatuses.includes(response.status) || attempt === maxRetries) {
        return response;
      }

      lastError = new Error(`Retryable status code: ${response.status}`);
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const backoffMs = initialDelayMs * Math.pow(backoffFactor, attempt);
    await delay(backoffMs);
  }

  throw lastError ?? new Error('fetchWithBackoff failed without a specific error');
}
