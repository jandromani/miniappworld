import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import {
  createPaymentRecord,
  findPaymentByReference,
  isLocalStorageDisabled,
  recordAuditEvent,
  updateWorldIdWallet,
} from '@/lib/database';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import { validateSameOrigin } from '@/lib/security';
import { validateCriticalEnvVars } from '@/lib/envValidation';
import { recordApiFailureMetric } from '@/lib/metrics';
import {
  isSupportedTokenAddress,
  isSupportedTokenSymbol,
  normalizeTokenIdentifier,
  tokensMatch,
} from '@/lib/tokenNormalization';
import { requireActiveSession } from '@/lib/sessionValidation';

const PATH = 'initiate-payment';

export async function POST(req: NextRequest) {
  try {
    const envError = validateCriticalEnvVars();
    if (envError) {
      return envError;
    }

    const { reference, type, token, amount, tournamentId, walletAddress, userId: bodyUserId } = await req.json();

    const originCheck = validateSameOrigin(req);
    if (!originCheck.valid) {
      await recordAuditEvent({
        action: 'initiate_payment',
        entity: 'payments',
        entityId: reference,
        status: 'error',
        details: { reason: originCheck.reason },
      });

      return apiErrorResponse('FORBIDDEN', { message: 'Solicitud no autorizada', path: PATH });
    }

    const sessionResult = await requireActiveSession(req, {
      path: PATH,
      audit: { action: 'initiate_payment', entity: 'payments', entityId: reference },
    });

    if ('error' in sessionResult) {
      return sessionResult.error;
    }

    const { sessionToken, identity } = sessionResult;

    if (bodyUserId && bodyUserId !== identity.user_id) {
      return apiErrorResponse('FORBIDDEN', {
        message: 'El usuario enviado no coincide con la sesión activa',
        details: { bodyUserId, sessionUser: identity.user_id },
        path: PATH,
      });
    }

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

    if (token && typeof token !== 'string') {
      return apiErrorResponse('INVALID_PAYLOAD', { message: 'Token inválido', path: PATH });
    }

    if (token && !isSupportedTokenSymbol(token) && !isSupportedTokenAddress(token)) {
      return apiErrorResponse('UNSUPPORTED_TOKEN', { message: 'Token no soportado', path: PATH });
    }

    const verifiedWalletAddress = walletAddress ?? identity.wallet_address;

    if (
      walletAddress &&
      identity.wallet_address &&
      walletAddress.toLowerCase() !== identity.wallet_address.toLowerCase()
    ) {
      return apiErrorResponse('FORBIDDEN', {
        message: 'La wallet enviada no coincide con la sesión verificada',
        path: PATH,
        details: { walletAddress, sessionWallet: identity.wallet_address },
      });
    }

    const normalizedToken = token
      ? normalizeTokenIdentifier(token)
      : normalizeTokenIdentifier(SUPPORTED_TOKENS.WLD.address);
    const tokenKey = resolveTokenFromAddress(normalizedToken) as SupportedToken;
    const decimals = SUPPORTED_TOKENS[tokenKey].decimals;
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return apiErrorResponse('INVALID_PAYLOAD', {
        message: 'El monto debe ser un número positivo',
        path: PATH,
      });
    }

    const existingPayment = await findPaymentByReference(reference);

    if (existingPayment) {
      const sameUser = !existingPayment.user_id || existingPayment.user_id === identity.user_id;
      const sameWallet = tokensMatch(
        existingPayment.wallet_address?.toLowerCase(),
        verifiedWalletAddress?.toLowerCase()
      );

      if (!sameUser || (!sameWallet && verifiedWalletAddress)) {
        return apiErrorResponse('REFERENCE_CONFLICT', {
          message: 'La referencia ya fue utilizada por otro usuario',
          path: PATH,
          details: { reference },
        });
      }

      return NextResponse.json({
        success: true,
        reference,
        tournamentId: existingPayment.tournament_id,
        userId: existingPayment.user_id ?? identity.user_id,
        walletAddress: existingPayment.wallet_address ?? verifiedWalletAddress,
      });
    }

    const tokenAmount = BigInt(Math.round(numericAmount * 10 ** decimals)).toString();

    if (verifiedWalletAddress) {
      await updateWorldIdWallet(identity.user_id, verifiedWalletAddress, {
        userId: identity.user_id,
        sessionId: sessionToken,
      });
    }

    await createPaymentRecord(
      {
        reference,
        type: type === 'tournament' ? 'tournament' : 'quick_match',
        token_address: normalizedToken ?? '',
        token_amount: tokenAmount,
        tournament_id: tournamentId,
        recipient_address: process.env.NEXT_PUBLIC_RECEIVER_ADDRESS,
        user_id: identity.user_id,
        wallet_address: verifiedWalletAddress,
        nullifier_hash: identity.nullifier_hash,
        session_token: sessionToken,
      },
      { userId: identity.user_id, sessionId: sessionToken }
    );

    logApiEvent('info', {
      path: PATH,
      action: 'initiate',
      reference,
      type,
      token,
      amount,
      tournamentId,
      userId: identity.user_id,
    });

    return NextResponse.json({ success: true, reference, tournamentId });
  } catch (error) {
    if (isLocalStorageDisabled(error)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Persistencia local deshabilitada. Configure un directorio compartido o servicio de storage.',
        },
        { status: 503 }
      );
    }

    console.error('[initiate-payment] Error inesperado', error);
    recordApiFailureMetric(PATH, 'UNEXPECTED_ERROR');
    return NextResponse.json({ success: false, message: 'Error interno al iniciar pago' }, { status: 500 });
  }
}
