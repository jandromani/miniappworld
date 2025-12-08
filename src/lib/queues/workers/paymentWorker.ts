import { Worker } from 'bullmq';
import { getBaseWorkerConfig } from '../config';
import { PaymentQueueJob, PAYMENT_QUEUE_NAME } from '../paymentQueue';
import { findPaymentByReference, recordAuditEvent, updatePaymentStatus } from '../../database';
import {
  addParticipantRecord,
  getTournament,
  incrementTournamentPool,
  participantExists,
} from '../../server/tournamentData';
import { enqueueNotification } from '../notificationQueue';

const paymentWorkerConfig = getBaseWorkerConfig({
  concurrency: Number(process.env.PAYMENT_WORKER_CONCURRENCY ?? process.env.WORKER_CONCURRENCY ?? 5),
});

async function processPayment(job: PaymentQueueJob) {
  const { reference, transactionId, confirmedAt, sessionId, userId } = job;
  const payment = await findPaymentByReference(reference);

  if (!payment) {
    throw new Error(`payment ${reference} not found`);
  }

  const context = { userId: userId ?? payment.user_id, sessionId };

  if (payment.status !== 'confirmed' || payment.transaction_id !== transactionId) {
    await updatePaymentStatus(
      reference,
      'confirmed',
      { transaction_id: transactionId, confirmed_at: confirmedAt },
      context
    );
  }

  await recordAuditEvent({
    action: 'process_payment',
    entity: 'payments',
    entityId: reference,
    sessionId,
    userId: context.userId,
    status: 'success',
    details: { via: 'queue', transactionId },
  });

  if (payment.type === 'tournament' && payment.tournament_id) {
    const tournament = await getTournament(payment.tournament_id);

    if (tournament) {
      await incrementTournamentPool(tournament);

      if (context.userId) {
        const alreadyJoined = await participantExists(tournament.tournamentId, context.userId);
        if (!alreadyJoined) {
          await addParticipantRecord(tournament.tournamentId, context.userId, reference, payment.wallet_address);
        }
      }
    }
  }

  if (payment.wallet_address) {
    await enqueueNotification({
      walletAddresses: [payment.wallet_address],
      title: 'Pago confirmado',
      message: 'Pago confirmado, ya puedes unirte al torneo',
      miniAppPath: payment.tournament_id ? `/tournament/${payment.tournament_id}` : '/tournament',
      dedupKey: `payment:${reference}:confirmed`,
    });
  }
}

export function startPaymentWorker() {
  const worker = new Worker<PaymentQueueJob>(
    PAYMENT_QUEUE_NAME,
    async (job) => processPayment(job.data),
    paymentWorkerConfig
  );

  worker.on('failed', (job, error) => {
    console.error('[payment_worker] Job failed', {
      jobId: job?.id,
      reference: job?.data.reference,
      error: error.message,
    });
  });

  worker.on('completed', (job) => {
    console.info('[payment_worker] Job completed', { jobId: job.id, reference: job.data.reference });
  });

  return worker;
}
