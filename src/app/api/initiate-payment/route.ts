import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import {
  createPaymentRecord,
  findPaymentByReference,
  findWorldIdVerificationBySession,
  recordAuditEvent,
} from '@/lib/database';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import { normalizeTokenIdentifier } from '@/lib/tokenNormalization';

const SESSION_COOKIE = 'session_token';
const PATH = 'initiate-payment';

export async function POST(req: NextRequest) {
  const { reference, type, token, amount, tournamentId, walletAddress, userId: bodyUserId } = await req.json();
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    await recordAuditEvent({
      action: 'initiate_payment',
      entity: 'payments',
      entityId: reference,
      sessionId: undefined,
      status: 'error',
      details: { reason: 'missing_session_token' },
    });
    return apiErrorResponse('SESSION_REQUIRED', {
      message: 'Sesión no verificada. Realiza la verificación de World ID.',
      path: PATH,
    });
  }

  const sessionIdentity = await findWorldIdVerificationBySession(sessionToken);

  if (!sessionIdentity) {
    await recordAuditEvent({
      action: 'initiate_payment',
      entity: 'payments',
      entityId: reference,
      sessionId: sessionToken,
      status: 'error',
      details: { reason: 'session_not_found' },
    });
    return apiErrorResponse('SESSION_INVALID', {
      message: 'Sesión inválida o expirada. Vuelve a verificar tu identidad.',
      path: PATH,
    });
  }

  if (bodyUserId && bodyUserId !== sessionIdentity.user_id) {
    return apiErrorResponse('FORBIDDEN', {
      message: 'El usuario enviado no coincide con la sesión activa',
      details: { bodyUserId, sessionUser: sessionIdentity.user_id },
      path: PATH,
    });
  }

  const verifiedIdentity = sessionIdentity;
  const verifiedUserId = sessionIdentity.user_id;
  const verifiedWalletAddress = walletAddress ?? sessionIdentity.wallet_address;

  if (!reference || !type) {
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: 'Referencia y tipo son obligatorios',
      path: PATH,
    });
  }

  if (type !== 'quick_match' && type !== 'tournament') {
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: 'Tipo de pago no soportado',
      path: PATH,
      details: { type },
    });
  }

  if (type === 'tournament' && !tournamentId) {
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: 'tournamentId es obligatorio para torneos',
      path: PATH,
    });
  }

  if (
    walletAddress &&
    sessionIdentity.wallet_address &&
    walletAddress.toLowerCase() !== sessionIdentity.wallet_address.toLowerCase()
  ) {
    return apiErrorResponse('FORBIDDEN', {
      message: 'La wallet enviada no coincide con la sesión verificada',
      path: PATH,
      details: { walletAddress, sessionWallet: sessionIdentity.wallet_address },
    });
  }

  const existingPayment = await findPaymentByReference(reference);

  if (existingPayment) {
    const sameUser = !existingPayment.user_id || existingPayment.user_id === sessionIdentity.user_id;
    const sameWallet =
      !existingPayment.wallet_address || !verifiedWalletAddress
        ? true
        : existingPayment.wallet_address.toLowerCase() === verifiedWalletAddress.toLowerCase();

    if (!sameUser || !sameWallet) {
      return apiErrorResponse('REFERENCE_CONFLICT', {
        message: 'La referencia ya fue utilizada por otro usuario',
        path: PATH,
        details: { reference },
      });
    }

    return NextResponse.json({ success: true, reference, tournamentId: existingPayment.tournament_id });
  }

  const normalizedToken = token
    ? normalizeTokenIdentifier(token)
    : normalizeTokenIdentifier(SUPPORTED_TOKENS.WLD.address);
  const tokenKey = resolveTokenFromAddress(normalizedToken) as SupportedToken;
  const decimals = SUPPORTED_TOKENS[tokenKey].decimals;
  const tokenAmount = amount !== undefined ? BigInt(Math.round(Number(amount) * 10 ** decimals)).toString() : '0';

  await createPaymentRecord({
    reference,
    type: type === 'tournament' ? 'tournament' : 'quick_match',
    token_address: normalizedToken ?? '',
    token_amount: tokenAmount,
    tournament_id: tournamentId,
    recipient_address: process.env.NEXT_PUBLIC_RECEIVER_ADDRESS,
    user_id: sessionIdentity.user_id,
    wallet_address: verifiedWalletAddress,
    nullifier_hash: sessionIdentity?.nullifier_hash,
    session_token: sessionToken,
  }, { userId: verifiedUserId, sessionId: sessionToken });

  logApiEvent('info', {
    path: PATH,
    action: 'initiate',
    reference,
    type,
    token,
    amount,
    tournamentId,
    userId: verifiedUserId,
  });

  return NextResponse.json({ success: true, reference, tournamentId });
}
