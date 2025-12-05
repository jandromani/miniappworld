import {
  MiniKit,
  VerificationLevel,
  Tokens,
  PayCommandInput,
  MiniAppPaymentErrorPayload,
  MiniAppPaymentSuccessPayload,
} from '@worldcoin/minikit-js';
import type { WorldIdAction } from './worldId';
import { fetchWithBackoff } from './fetchWithBackoff';

/**
 * Verificar World ID (prueba de persona única)
 */
export async function verifyWorldID(action: WorldIdAction) {
  if (!MiniKit.isInstalled()) {
    throw new Error('MiniKit no está instalado');
  }

  const { finalPayload } = await MiniKit.commandsAsync.verify({
    action,
    verification_level: VerificationLevel.Orb,
  });

  if (finalPayload.status === 'error') {
    throw new Error(`Error en Verify: ${finalPayload.error_code}`);
  }

  return finalPayload;
}

/**
 * Pagar con Pay command (WLD, USDC, etc.)
 */
export async function payWithMiniKit(
  payload: PayCommandInput
): Promise<MiniAppPaymentSuccessPayload | MiniAppPaymentErrorPayload> {
  if (!MiniKit.isInstalled()) {
    throw new Error('MiniKit no está instalado');
  }

  const { finalPayload } = await MiniKit.commandsAsync.pay(payload);

  return finalPayload;
}

/**
 * Enviar transacción (Send Transaction)
 */
export async function sendTransaction(transaction: any) {
  if (!MiniKit.isInstalled()) {
    throw new Error('MiniKit no está instalado');
  }

  const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
    transaction: [transaction],
  });

  if (finalPayload.status === 'error') {
    throw new Error(`Error en Send Transaction: ${finalPayload.error_code}`);
  }

  return finalPayload;
}

/**
 * Enviar notificación (backend)
 */
export async function sendNotification(userId: string, message: string) {
  const res = await fetchWithBackoff('/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message }),
    timeoutMs: 5000,
    maxRetries: 2,
  });

  if (!res.ok) {
    throw new Error('Error al enviar notificación');
  }

  return res.json();
}
