import { NextRequest, NextResponse } from 'next/server';
import { MiniAppPaymentSuccessPayload } from '@worldcoin/minikit-js';
import {
  findPaymentByReference,
  findWorldIdVerificationBySession,
  recordAuditEvent,
  updatePaymentStatus,
} from '@/lib/database';
import { TOKEN_AMOUNT_TOLERANCE, resolveTokenFromAddress } from '@/lib/constants';
import { normalizeTokenIdentifier, tokensMatch } from '@/lib/tokenNormalization';
import { sendNotification } from '@/lib/notificationService';

function normalizeTokenAmount(value: unknown): bigint {
  const asString = typeof value === 'string' ? value : value?.toString?.();
  if (!asString) {
    throw new Error('Token amount inválido');
  }

  return BigInt(asString);
}

export async function POST(req: NextRequest) {
  const { payload, reference } = (await req.json()) as {
    payload: MiniAppPaymentSuccessPayload;
    reference: string;
  };

  const sessionToken = req.cookies.get('session_token')?.value;
  const sessionId = sessionToken;

  if (!sessionToken) {
    await recordAuditEvent({
      action: 'confirm_payment',
      entity: 'payments',
      entityId: reference,
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
      action: 'confirm_payment',
      entity: 'payments',
      entityId: reference,
      sessionId,
      status: 'error',
      details: { reason: 'session_not_found' },
    });

    return NextResponse.json(
      { success: false, message: 'Sesión inválida o expirada. Vuelve a verificar tu identidad.' },
      { status: 401 }
    );
  }

  if (!payload || !reference) {
    return NextResponse.json(
      { success: false, message: 'Payload y referencia son obligatorios' },
      { status: 400 }
    );
  }

  if (payload.status === 'error') {
    return NextResponse.json({ success: false, message: 'Pago rechazado' }, { status: 400 });
  }

  const storedPayment = await findPaymentByReference(reference);

  if (!storedPayment) {
    return NextResponse.json({ success: false, message: 'Referencia no encontrada' }, { status: 400 });
  }

  if (storedPayment.status === 'confirmed') {
    return NextResponse.json({ success: true, message: 'Pago ya confirmado previamente' });
  }

  if (!process.env.APP_ID || !process.env.DEV_PORTAL_API_KEY) {
    return NextResponse.json(
      { success: false, message: 'Faltan APP_ID o DEV_PORTAL_API_KEY' },
      { status: 500 }
    );
  }

  // 2. Consultar estado del pago en Developer Portal API
  const response = await fetch(
    `https://developer.worldcoin.org/api/v2/minikit/transaction/${payload.transaction_id}?app_id=${process.env.APP_ID}&type=payment`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.DEV_PORTAL_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { success: false, message: 'No se pudo verificar el pago en Developer Portal' },
      { status: 502 }
    );
  }

  const transaction = await response.json();

  const transactionWallet =
    transaction.wallet_address ||
    transaction.walletAddress ||
    transaction.from_address ||
    transaction.from?.address ||
    payload?.wallet_address ||
    payload?.from_address;

  const transactionStatus = (transaction.transaction_status || transaction.status || '').toString().toLowerCase();
  const transactionReference = transaction.reference || transaction.transaction_reference;

  if (transactionReference !== reference) {
    await updatePaymentStatus(
      reference,
      'failed',
      {
        reason: 'Referencia devuelta no coincide con el pago iniciado',
      },
      { userId: storedPayment.user_id, sessionId }
    );

    return NextResponse.json(
      {
        success: false,
        message: 'La referencia devuelta no coincide con el pago esperado',
      },
      { status: 400 }
    );
  }

  const transactionToken =
    transaction.token || transaction.token_symbol || transaction.payment_token || transaction.asset;
  const transactionAmountRaw =
    transaction.amount || transaction.token_amount || transaction.tokens?.[0]?.amount || transaction.tokens?.[0]?.token_amount;
  let transactionAmount: bigint | undefined;
  try {
    transactionAmount = transactionAmountRaw !== undefined ? normalizeTokenAmount(transactionAmountRaw) : undefined;
  } catch (error) {
    await updatePaymentStatus(
      reference,
      'failed',
      { reason: 'Monto devuelto no es válido' },
      {
        userId: storedPayment.user_id,
        sessionId,
      }
    );
    return NextResponse.json({ success: false, message: 'Monto de la transacción no válido' }, { status: 400 });
  }

  const normalizedExpectedToken = storedPayment.token_address
    ? normalizeTokenIdentifier(storedPayment.token_address)
    : undefined;
  const expectedTokenKey = normalizedExpectedToken
    ? resolveTokenFromAddress(normalizedExpectedToken)
    : null;
  const amountTolerance = expectedTokenKey ? TOKEN_AMOUNT_TOLERANCE[expectedTokenKey] ?? 0n : 0n;

  if (storedPayment.session_token && storedPayment.session_token !== sessionToken) {
    await updatePaymentStatus(
      reference,
      'failed',
      {
        reason: 'La sesión actual no coincide con la sesión del pago',
      },
      { userId: storedPayment.user_id, sessionId }
    );

    return NextResponse.json(
      { success: false, message: 'La referencia pertenece a otra sesión' },
      { status: 403 }
    );
  }

  const verifiedIdentity = sessionIdentity;

  if (storedPayment.user_id && storedPayment.user_id !== verifiedIdentity.user_id) {
    await updatePaymentStatus(
      reference,
      'failed',
      {
        reason: 'La sesión no coincide con el usuario asociado al pago',
      },
      { userId: storedPayment.user_id, sessionId }
    );

    return NextResponse.json(
      { success: false, message: 'El pago pertenece a otro usuario verificado' },
      { status: 403 }
    );
  }

  if (storedPayment.nullifier_hash && !verifiedIdentity?.nullifier_hash) {
    await updatePaymentStatus(
      reference,
      'failed',
      {
        reason: 'No se pudo validar la identidad asociada al pago',
      },
      { userId: storedPayment.user_id, sessionId }
    );

    return NextResponse.json(
      { success: false, message: 'La sesión verificada es requerida para confirmar el pago' },
      { status: 403 }
    );
  }

  if (
    storedPayment.nullifier_hash &&
    verifiedIdentity?.nullifier_hash &&
    storedPayment.nullifier_hash !== verifiedIdentity.nullifier_hash
  ) {
    await updatePaymentStatus(
      reference,
      'failed',
      {
        reason: 'La identidad verificada no coincide con la que inició el pago',
      },
      { userId: storedPayment.user_id, sessionId }
    );
  
    return NextResponse.json(
      { success: false, message: 'El pago pertenece a otra identidad verificada' },
      { status: 403 }
    );
  }

  if (
    normalizedExpectedToken &&
    transactionToken &&
    !tokensMatch(normalizedExpectedToken, normalizeTokenIdentifier(transactionToken))
  ) {
    await updatePaymentStatus(
      reference,
      'failed',
      {
        reason: 'Token no coincide con el pago esperado',
      },
      { userId: storedPayment.user_id, sessionId }
    );

    return NextResponse.json(
      {
        success: false,
        message: 'El token cobrado no coincide con el pago solicitado',
      },
      { status: 400 }
    );
  }

  if (transactionAmount !== undefined && storedPayment.token_amount) {
    const expected = BigInt(storedPayment.token_amount);
    const difference = transactionAmount >= expected ? transactionAmount - expected : expected - transactionAmount;

    if (difference > amountTolerance) {
      await updatePaymentStatus(
        reference,
        'failed',
        {
          reason: 'Monto no coincide con el pago esperado',
        },
        { userId: storedPayment.user_id, sessionId }
      );

      return NextResponse.json(
        { success: false, message: 'El monto cobrado no coincide con el pago solicitado' },
        { status: 400 }
      );
    }
  }

  if (storedPayment.wallet_address) {
    if (!transactionWallet) {
      await updatePaymentStatus(
        reference,
        'failed',
        {
          reason: 'No se pudo verificar la wallet que realizó el pago',
        },
        { userId: storedPayment.user_id, sessionId }
      );

      return NextResponse.json(
        { success: false, message: 'No se pudo validar la wallet del pago' },
        { status: 400 }
      );
    }

    const sameWallet =
      storedPayment.wallet_address.toLowerCase() === transactionWallet.toString().toLowerCase();

    if (!sameWallet) {
      await updatePaymentStatus(
        reference,
        'failed',
        {
          reason: 'La wallet cobradora no coincide con la que inició el pago',
        },
        { userId: storedPayment.user_id, sessionId }
      );

      return NextResponse.json(
        { success: false, message: 'La wallet que pagó no coincide con la esperada' },
        { status: 400 }
      );
    }
  }

  if (storedPayment.type === 'tournament') {
    const transactionTournamentId = transaction.tournamentId || transaction.tournament_id || transaction.metadata?.tournamentId;
    if (storedPayment.tournament_id && transactionTournamentId && storedPayment.tournament_id !== transactionTournamentId) {
      await updatePaymentStatus(
        reference,
        'failed',
        {
          reason: 'Referencia de torneo no coincide con el flujo solicitado',
        },
        { userId: storedPayment.user_id, sessionId }
      );

      return NextResponse.json(
        {
          success: false,
          message: 'La referencia está asociada a otro torneo, no se puede reutilizar',
        },
        { status: 400 }
      );
    }
  }

  const isSuccessful = ['success', 'confirmed'].includes(transactionStatus);

  if (isSuccessful) {
    const confirmedAt = new Date().toISOString();
    await updatePaymentStatus(
      reference,
      'confirmed',
      {
        transaction_id: payload.transaction_id,
        confirmed_at: confirmedAt,
      },
      { userId: storedPayment.user_id, sessionId }
    );

    if (storedPayment.wallet_address) {
      await sendNotification({
        walletAddresses: [storedPayment.wallet_address],
        title: 'Pago confirmado',
        message: 'Pago confirmado, ya puedes unirte al torneo',
        miniAppPath: storedPayment.tournament_id ? `/tournament/${storedPayment.tournament_id}` : '/tournament',
      });
    }

    return NextResponse.json({ success: true, message: 'Pago confirmado' });
  }

  const failureMessage = getFailureMessage(transactionStatus);

  console.error('Error al confirmar pago', {
    reference,
    transactionStatus,
    transaction_id: payload.transaction_id,
  });

  await updatePaymentStatus(reference, 'failed', { reason: failureMessage }, { userId: storedPayment.user_id, sessionId });

  return NextResponse.json({ success: false, message: failureMessage }, { status: 400 });
}

function getFailureMessage(status: string) {
  switch (status) {
    case 'rejected':
      return 'Pago rechazado por el usuario';
    case 'insufficient_funds':
    case 'insufficient_balance':
      return 'Saldo insuficiente para completar el pago';
    case 'failed':
    default:
      return 'La transacción falló, intenta nuevamente';
  }
}
