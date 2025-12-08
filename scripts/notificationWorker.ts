import { startNotificationWorker } from '../src/lib/queues/workers/notificationWorker';

const worker = startNotificationWorker();

function shutdown() {
  worker
    .close()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[notification_worker] Error al cerrar', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
