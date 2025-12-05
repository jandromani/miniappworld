import { v4 as uuidv4 } from 'uuid';
import {
  MiniAppPaymentErrorPayload,
  MiniAppPaymentSuccessPayload,
  Tokens,
  tokenToDecimals,
} from '@worldcoin/minikit-js';
import {
  MEMECOIN_CONFIG,
  SUPPORTED_TOKENS,
  SupportedToken,
  TOURNAMENT_CONTRACT_ADDRESS,
} from './constants';
import { payWithMiniKit } from './miniKitClient';

const RECEIVER_ADDRESS = process.env.NEXT_PUBLIC_RECEIVER_ADDRESS || '0xYourAddress';

type PaymentType = 'quick_match' | 'tournament';

type InitiatePaymentPayload = {
  reference: string;
  type: PaymentType;
  token?: SupportedToken;
  amount?: number;
  tournamentId?: string;
};

type TokenConfig = {
  symbol: string;
  token_amount: string;
};

const PAY_ERROR_MESSAGES: Record<string, string> = {
  payment_rejected: 'Pago cancelado',
  insufficient_balance: 'Saldo insuficiente, añade fondos',
  transaction_failed: 'Transacción fallida, intenta de nuevo',
  generic_error: 'Error inesperado, contacta soporte',
};

function getTokenConfig(token: SupportedToken, amount: number): TokenConfig {
  const config = SUPPORTED_TOKENS[token];

  if (token === 'MEMECOIN') {
    return {
      symbol: MEMECOIN_CONFIG.address,
      token_amount: (amount * 10 ** config.decimals).toString(),
    };
  }

  return {
    symbol: config.symbol,
    token_amount: tokenToDecimals(amount, config.symbol as Tokens).toString(),
  };
}

async function initiatePayment(body: InitiatePaymentPayload) {
  const response = await fetch('/api/initiate-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Error al iniciar pago');
  }
}

function handlePayError(finalPayload: MiniAppPaymentErrorPayload): never {
  const message = PAY_ERROR_MESSAGES[finalPayload.error_code] ?? PAY_ERROR_MESSAGES.generic_error;
  throw new Error(message);
}

async function confirmPayment(
  payload: MiniAppPaymentSuccessPayload,
  reference: string
): Promise<{ success: boolean }> {
  const response = await fetch('/api/confirm-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ payload, reference }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result?.message ?? 'Pago no verificado');
  }

  return result;
}

async function executePayCommand({
  reference,
  tokens,
  description,
  to,
}: {
  reference: string;
  tokens: TokenConfig[];
  description: string;
  to: string;
}) {
  const finalPayload = await payWithMiniKit({
    reference,
    to,
    tokens,
    description,
  });

  if (finalPayload.status === 'error') {
    return handlePayError(finalPayload);
  }

  return finalPayload;
}

/**
 * Pagar por partida rápida (1 WLD)
 */
export async function payForQuickMatch() {
  const reference = uuidv4().replace(/-/g, '');

  await initiatePayment({ reference, type: 'quick_match' });

  const finalPayload = (await executePayCommand({
    reference,
    tokens: [getTokenConfig('WLD', 1)],
    description: 'Entrada a partida rápida',
    to: RECEIVER_ADDRESS,
  })) as MiniAppPaymentSuccessPayload;

  return confirmPayment(finalPayload, reference);
}

/**
 * Pagar por torneo (buy-in configurable)
 */
export async function payForTournament(token: SupportedToken, amount: number, tournamentId?: string) {
  const reference = uuidv4().replace(/-/g, '');

  await initiatePayment({ reference, type: 'tournament', token, amount, tournamentId });

  const tokenConfig = getTokenConfig(token, amount);

  const finalPayload = (await executePayCommand({
    reference,
    tokens: [tokenConfig],
    description: `Entrada a torneo (${amount} ${SUPPORTED_TOKENS[token].symbol})`,
    to: TOURNAMENT_CONTRACT_ADDRESS,
  })) as MiniAppPaymentSuccessPayload;

  return confirmPayment(finalPayload, reference);
}
