import fs from 'fs/promises';
import path from 'path';

export type NotificationAuditEvent = {
  timestamp: string;
  apiKeyHash: string;
  role?: string;
  walletCount?: number;
  clientIp?: string;
  origin?: string | null;
  fingerprint?: string;
  success: boolean;
  reason?: string;
};

const AUDIT_LOG_PATH =
  process.env.NOTIFICATION_AUDIT_LOG_PATH ?? path.join(process.cwd(), 'data', 'notification-audit.log');

async function ensureLogDirectory() {
  await fs.mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
}

export async function appendNotificationAuditEvent(event: NotificationAuditEvent) {
  try {
    await ensureLogDirectory();
    await fs.appendFile(AUDIT_LOG_PATH, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (error) {
    console.error('[notificationAuditLog] No se pudo escribir en el log de auditoría', error);
  }
}
