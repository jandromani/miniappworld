import { v4 as uuidv4 } from 'uuid';
import { Tokens, tokenToDecimals } from '@worldcoin/minikit-js';
import { payWithMiniKit } from './miniKitClient';

const RECEIVER_ADDRESS = process.env.NEXT_PUBLIC_RECEIVER_ADDRESS || '0xYourAddress';

/**
 * Pagar por partida rápida (1 WLD)
 */
export async function payForQuickMatch() {
  // 1. Generar referencia única
  const reference = uuidv4().replace(/-/g, '');

  // 2. Guardar referencia en backend
  const initRes = await fetch('/api/initiate-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, type: 'quick_match' }),
  });

  if (!initRes.ok) {
    throw new Error('Error al iniciar pago');
  }

  // 3. Ejecutar Pay command
  const finalPayload = await payWithMiniKit({
    reference,
    to: RECEIVER_ADDRESS,
    tokens: [
      {
        symbol: Tokens.WLD,
        token_amount: tokenToDecimals(1, Tokens.WLD).toString(),
      },
    ],
    description: 'Entrada a partida rápida',
  });

  // 4. Verificar pago en backend
  const confirmRes = await fetch('/api/confirm-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: finalPayload, reference }),
  });

  const result = await confirmRes.json();

  if (!result.success) {
    throw new Error('Pago no verificado');
  }

  return result;
}

/**
 * Pagar por torneo (buy-in configurable)
 */
export async function payForTournament(token: Tokens, amount: number) {
  const reference = uuidv4().replace(/-/g, '');

  const initRes = await fetch('/api/initiate-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, type: 'tournament', token, amount }),
  });

  if (!initRes.ok) {
    throw new Error('Error al iniciar pago de torneo');
  }

  const finalPayload = await payWithMiniKit({
    reference,
    to: RECEIVER_ADDRESS,
    tokens: [
      {
        symbol: token,
        token_amount: tokenToDecimals(amount, token).toString(),
      },
    ],
    description: `Entrada a torneo (${amount} ${token})`,
  });

  const confirmRes = await fetch('/api/confirm-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: finalPayload, reference }),
  });

  const result = await confirmRes.json();

  if (!result.success) {
    throw new Error('Pago de torneo no verificado');
  }

  return result;
}
