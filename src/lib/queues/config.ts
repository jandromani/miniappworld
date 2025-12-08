import { JobsOptions, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';

let cachedConnection: IORedis | undefined;

export function getRedisConnection() {
  if (!cachedConnection) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('[queue] Falta la variable de entorno requerida REDIS_URL');
    }

    cachedConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  return cachedConnection;
}

export const queuePrefix = process.env.QUEUE_PREFIX ?? 'miniappworld';

export const defaultJobOptions: JobsOptions = {
  attempts: Number(process.env.QUEUE_MAX_RETRIES ?? 5),
  backoff: {
    type: 'exponential',
    delay: Number(process.env.QUEUE_BACKOFF_MS ?? 2000),
  },
  removeOnComplete: 1000,
  removeOnFail: 2000,
};

export function getBaseWorkerConfig(overrides: Partial<WorkerOptions> = {}): WorkerOptions {
  return {
    connection: getRedisConnection(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    lockDuration: Number(process.env.WORKER_LOCK_DURATION_MS ?? 30000),
    prefix: queuePrefix,
    ...overrides,
  };
}
