import { Worker } from 'bullmq';
import { getBaseWorkerConfig } from '../config';
import { NotificationQueueJob, NOTIFICATION_QUEUE_NAME } from '../notificationQueue';
import { sendNotification } from '../../notificationService';

const notificationWorkerConfig = getBaseWorkerConfig({
  concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY ?? process.env.WORKER_CONCURRENCY ?? 5),
});

async function processNotification(job: NotificationQueueJob) {
  if (!job.walletAddresses?.length) {
    return { delivered: 0 };
  }

  const walletAddresses = Array.from(new Set(job.walletAddresses.filter(Boolean)));

  const result = await sendNotification({
    walletAddresses,
    title: job.title,
    message: job.message,
    miniAppPath: job.miniAppPath,
  });

  if (!result.success) {
    throw new Error(result.message ?? 'Notification send failed');
  }

  return { delivered: walletAddresses.length };
}

export function startNotificationWorker() {
  const worker = new Worker<NotificationQueueJob>(
    NOTIFICATION_QUEUE_NAME,
    async (job) => processNotification(job.data),
    notificationWorkerConfig
  );

  worker.on('failed', (job, error) => {
    console.error('[notification_worker] Job failed', {
      jobId: job?.id,
      error: error.message,
    });
  });

  worker.on('completed', (job, result) => {
    console.info('[notification_worker] Job completed', {
      jobId: job.id,
      delivered: (result as { delivered?: number })?.delivered,
    });
  });

  return worker;
}
