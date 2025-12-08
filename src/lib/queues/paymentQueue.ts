import { Queue } from 'bullmq';
import { defaultJobOptions, getRedisConnection, queuePrefix } from './config';

export const PAYMENT_QUEUE_NAME = 'payments';

export type PaymentQueueJob = {
  reference: string;
  transactionId: string;
  confirmedAt: string;
  sessionId?: string;
  userId?: string;
};

const paymentQueue = new Queue<PaymentQueueJob>(PAYMENT_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions,
  prefix: queuePrefix,
});

export async function enqueuePaymentProcessing(job: PaymentQueueJob) {
  const jobId = `payment:${job.reference}`;

  try {
    return await paymentQueue.add('payments:process', job, { jobId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return paymentQueue.getJob(jobId);
    }

    throw error;
  }
}

export function getPaymentQueue() {
  return paymentQueue;
}
