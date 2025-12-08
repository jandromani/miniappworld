import crypto from 'crypto';
import { Queue } from 'bullmq';
import { defaultJobOptions, getRedisConnection, queuePrefix } from './config';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export type NotificationQueueJob = {
  walletAddresses: string[];
  title: string;
  message: string;
  miniAppPath?: string;
  dedupKey?: string;
};

const notificationQueue = new Queue<NotificationQueueJob>(NOTIFICATION_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions,
  prefix: queuePrefix,
});

export async function enqueueNotification(job: NotificationQueueJob) {
  const jobId = job.dedupKey ?? buildDeterministicId(job);

  try {
    return await notificationQueue.add('notifications:send', job, { jobId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return notificationQueue.getJob(jobId);
    }

    throw error;
  }
}

export function getNotificationQueue() {
  return notificationQueue;
}

function buildDeterministicId(job: NotificationQueueJob) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({
    walletAddresses: [...job.walletAddresses].sort(),
    title: job.title,
    message: job.message,
    miniAppPath: job.miniAppPath,
  }));

  return `notification:${hash.digest('hex')}`;
}
