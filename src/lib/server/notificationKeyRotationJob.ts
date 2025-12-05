import { rotateApiKey } from '@/lib/notificationApiKeys';

const ROTATION_INTERVAL_MS = Number(process.env.NOTIFICATION_KEY_ROTATION_MS ?? 1000 * 60 * 60 * 24);

const globalState = globalThis as typeof globalThis & {
  notificationKeyRotationStarted?: boolean;
};

async function rotateManagedKeys() {
  try {
    const notificationResult = await rotateApiKey('notification', 'notification');
    const developerResult = await rotateApiKey('developer_portal', 'developer_portal');

    if (notificationResult?.newKey) {
      process.env.NOTIFICATIONS_API_KEY = notificationResult.newKey;
    }

    if (developerResult?.newKey) {
      process.env.DEV_PORTAL_API_KEY = developerResult.newKey;
    }

    console.info('[notification_key_rotation] Nuevas claves generadas');
  } catch (error) {
    console.error('[notification_key_rotation] No se pudo rotar las API keys', error);
  }
}

function startRotationJob() {
  if (globalState.notificationKeyRotationStarted) return;
  globalState.notificationKeyRotationStarted = true;

  rotateManagedKeys();
  setInterval(() => rotateManagedKeys(), ROTATION_INTERVAL_MS);
}

startRotationJob();
