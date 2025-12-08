import { startPaymentWorker } from '../src/lib/queues/workers/paymentWorker';

const worker = startPaymentWorker();

function shutdown() {
  worker
    .close()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[payment_worker] Error al cerrar', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
