import { startNotificationWorker } from '../src/lib/queues/workers/notificationWorker';
import { startPaymentWorker } from '../src/lib/queues/workers/paymentWorker';

const workers = [startPaymentWorker(), startNotificationWorker()];

function shutdown() {
  Promise.allSettled(workers.map((worker) => worker.close()))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[workers] Error al cerrar los workers', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
