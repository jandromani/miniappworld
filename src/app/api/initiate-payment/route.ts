import { NextRequest, NextResponse } from 'next/server';
import {
  createPaymentRecord,
  findPaymentByReference,
  findWorldIdVerificationBySession,
  isLocalStorageDisabled,
  recordAuditEvent,
} from '@/lib/database';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import { normalizeTokenIdentifier } from '@/lib/tokenNormalization';

const SESSION_COOKIE = 'session_token';

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json(
        { success: false, message: 'Sesión no verificada. Realiza la verificación de World ID.' },
        { status: 401 }
      );
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
      return NextResponse.json(
        { success: false, message: 'Sesión inválida o expirada. Vuelve a verificar tu identidad.' },
        { status: 401 }
      );
    }

    if (bodyUserId && bodyUserId !== sessionIdentity.user_id) {
      return NextResponse.json(
        { success: false, message: 'El usuario enviado no coincide con la sesión activa' },
        { status: 403 }
      );
    }

    const verifiedIdentity = sessionIdentity;
    const verifiedUserId = sessionIdentity.user_id;
    const verifiedWalletAddress = sessionIdentity.wallet_address;

    if (!reference || !type) {
      return NextResponse.json(
        { success: false, message: 'Referencia y tipo son obligatorios' },
        { status: 400 }
      );
    }

    if (type !== 'quick_match' && type !== 'tournament') {
      return NextResponse.json(
        { success: false, message: 'Tipo de pago no soportado' },
        { status: 400 }
      );
    }

    if (type === 'tournament' && !tournamentId) {
      return NextResponse.json(
        { success: false, message: 'tournamentId es obligatorio para torneos' },
        { status: 400 }
      );
    }

    const verifiedWalletAddress = walletAddress ?? sessionIdentity.wallet_address;

    if (
      walletAddress &&
      sessionIdentity.wallet_address &&
      walletAddress.toLowerCase() !== sessionIdentity.wallet_address.toLowerCase()
    ) {
      return NextResponse.json(
        { success: false, message: 'La wallet enviada no coincide con la sesión verificada' },
        { status: 403 }
      );
    }

    const existingPayment = await findPaymentByReference(reference);

    if (existingPayment) {
      const sameUser = !existingPayment.user_id || existingPayment.user_id === sessionIdentity.user_id;
      const sameWallet =
        !existingPayment.wallet_address || !verifiedWalletAddress
          ? true
          : existingPayment.wallet_address.toLowerCase() === verifiedWalletAddress.toLowerCase();

      if (!sameUser || !sameWallet) {
        return NextResponse.json(
          { success: false, message: 'La referencia ya fue utilizada por otro usuario' },
          { status: 403 }
        );
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

    console.log('Pago iniciado:', { reference, type, token, amount, tournamentId });

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
    return NextResponse.json({ success: false, message: 'Error interno al iniciar pago' }, { status: 500 });
  }
}
