import {
  MiniKit,
  VerificationLevel,
  Tokens,
  PayCommandInput,
  MiniAppPaymentErrorPayload,
  MiniAppPaymentSuccessPayload,
} from '@worldcoin/minikit-js';

/**
 * Verificar World ID (prueba de persona única)
 */
export async function verifyWorldID(action: string) {
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
  const res = await fetch('/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message }),
  });

  if (!res.ok) {
    throw new Error('Error al enviar notificación');
  }

  return res.json();
}
