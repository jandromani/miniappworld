import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import {
  createPaymentRecord,
  findPaymentByReference,
  findWorldIdVerificationBySession,
  isLocalStorageDisabled,
  recordAuditEvent,
  updateWorldIdWallet,
} from '@/lib/database';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import { normalizeTokenIdentifier, isSupportedTokenSymbol, isSupportedTokenAddress } from '@/lib/tokenNormalization';
import { validateCsrf, validateSameOrigin } from '@/lib/security';
import { validateCriticalEnvVars } from '@/lib/envValidation';
import { recordApiFailureMetric } from '@/lib/metrics';

const SESSION_COOKIE = 'session_token';
const PATH = 'initiate-payment';

export async function POST(req: NextRequest) {
  try {
    const envError = validateCriticalEnvVars();
    if (envError) {
      return envError;
    }

    const {
      reference,
      type,
      token,
      amount,
      tournamentId,
      walletAddress,
      userId: bodyUserId,
    } = await req.json();

    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;

    const originCheck = validateSameOrigin(req);
    const csrfCheck = validateCsrf(req);

    if (!originCheck.valid || !csrfCheck.valid) {
      await recordAuditEvent({
        action: 'initiate_payment',
        entity: 'payments',
        entityId: reference,
        sessionId: sessionToken,
        status: 'error',
        details: { reason: originCheck.valid ? csrfCheck.reason : originCheck.reason },
      });

      return NextResponse.json({ success: false, message: 'Solicitud no autorizada' }, { status: 403 });
    }

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

    const verifiedUserId = sessionIdentity.user_id;
    const verifiedWalletAddress = walletAddress ?? sessionIdentity.wallet_address;
    const verifiedNullifier = sessionIdentity.nullifier_hash;

    if (!verifiedUserId || !verifiedWalletAddress || !verifiedNullifier) {
      await recordAuditEvent({
        action: 'initiate_payment',
        entity: 'payments',
        entityId: reference,
        sessionId: sessionToken,
        status: 'error',
        details: { reason: 'missing_session_identity_fields' },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Información de sesión incompleta. Vuelve a verificar tu identidad.',
        },
        { status: 400 }
      );
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

      return NextResponse.json({
        success: true,
        reference,
        tournamentId: existingPayment.tournament_id,
        userId: existingPayment.user_id ?? sessionIdentity.user_id,
        walletAddress: existingPayment.wallet_address ?? verifiedWalletAddress,
      });
    }

    if (token && typeof token !== 'string') {
      return NextResponse.json({ success: false, message: 'Token inválido' }, { status: 400 });
    }

    if (token && !isSupportedTokenSymbol(token) && !isSupportedTokenAddress(token)) {
      return NextResponse.json({ success: false, message: 'Token no soportado' }, { status: 400 });
    }

    const normalizedToken = token
      ? normalizeTokenIdentifier(token)
      : normalizeTokenIdentifier(SUPPORTED_TOKENS.WLD.address);
    const tokenKey = resolveTokenFromAddress(normalizedToken) as SupportedToken;
    const decimals = SUPPORTED_TOKENS[tokenKey].decimals;
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ success: false, message: 'El monto debe ser un número positivo' }, { status: 400 });
    }

    const tokenAmount = BigInt(Math.round(numericAmount * 10 ** decimals)).toString();

    if (verifiedWalletAddress) {
      await updateWorldIdWallet(verifiedUserId, verifiedWalletAddress, {
        userId: verifiedUserId,
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
        user_id: verifiedUserId,
        wallet_address: verifiedWalletAddress,
        nullifier_hash: verifiedNullifier,
        session_token: sessionToken,
      },
      { userId: verifiedUserId, sessionId: sessionToken }
    );

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
