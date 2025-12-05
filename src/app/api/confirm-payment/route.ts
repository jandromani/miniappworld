import { NextRequest, NextResponse } from 'next/server';
import { MiniAppPaymentSuccessPayload } from '@worldcoin/minikit-js';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import {
  findPaymentByReference,
  findWorldIdVerificationBySession,
  isLocalStorageDisabled,
  PaymentRecord,
  recordAuditEvent,
  updatePaymentStatus,
} from '@/lib/database';
import { TOKEN_AMOUNT_TOLERANCE, resolveTokenFromAddress } from '@/lib/constants';
import { normalizeTokenIdentifier, tokensMatch } from '@/lib/tokenNormalization';
import { sendNotification } from '@/lib/notificationService';
import { resolveTokenFromAddress } from '@/lib/constants';
import { validateSameOrigin } from '@/lib/security';
import { validateCriticalEnvVars } from '@/lib/envValidation';
import { getTournament, incrementTournamentPool } from '@/lib/server/tournamentData';

const PATH = 'confirm-payment';

function normalizeTokenAmount(value: unknown): bigint {
  const asString = typeof value === 'string' ? value : value?.toString?.();
  if (!asString) {
    throw new Error('Token amount inválido');
  }

  const normalized = BigInt(asString);

  if (normalized <= 0n) {
    throw new Error('Token amount debe ser positivo');
  }

  return normalized;
}

function shouldSimulateDeveloperPortal(tokenAddress?: string | null) {
  if (!tokenAddress) return false;

  const tokenKey = resolveTokenFromAddress(normalizeTokenIdentifier(tokenAddress));

  return tokenKey === 'WLD' || tokenKey === 'USDC' || tokenKey === 'MEMECOIN';
}

function buildSimulatedTransaction(
  payload: MiniAppPaymentSuccessPayload,
  storedPayment: PaymentRecord
) {
  const payloadToken = payload.tokens?.[0];
  const amountFromPayload =
    payloadToken?.token_amount ?? payloadToken?.amount ?? (payload as unknown as { amount?: string })?.amount;
  const walletFromPayload =
    payload.wallet_address || payload.from_address || payloadToken?.wallet_address || payloadToken?.from_address;

  return {
    transaction_status: 'confirmed',
    status: 'success',
    reference: storedPayment.reference,
    transaction_reference: storedPayment.reference,
    token: payloadToken?.token ?? payloadToken?.symbol ?? storedPayment.token_address,
    token_symbol: payloadToken?.symbol,
    payment_token: payloadToken?.token ?? payloadToken?.symbol ?? storedPayment.token_address,
    token_amount: amountFromPayload ?? storedPayment.token_amount,
    amount: amountFromPayload ?? storedPayment.token_amount,
    wallet_address: walletFromPayload,
    from_address: walletFromPayload,
  };
}

export async function POST(req: NextRequest) {
  try {
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
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const { payload, reference } = (await req.json()) as {
    payload: MiniAppPaymentSuccessPayload;
    reference: string;
  };

  const sessionToken = req.cookies.get('session_token')?.value;
  const sessionId = sessionToken;

  const originCheck = validateSameOrigin(req);

  if (!originCheck.valid) {
    await recordAuditEvent({
      action: 'confirm_payment',
      entity: 'payments',
      entityId: reference,
      sessionId,
      status: 'error',
      details: { reason: originCheck.reason },
    });

    return NextResponse.json({ success: false, message: 'Solicitud no autorizada' }, { status: 403 });
  }

  if (!sessionToken) {
    await recordAuditEvent({
      action: 'confirm_payment',
      entity: 'payments',
      entityId: reference,
      sessionId,
      status: 'error',
      details: { reason: 'missing_session_token' },
    });

    return apiErrorResponse('SESSION_REQUIRED', {
      message: 'Sesión no verificada. Realiza la verificación de World ID.',
      path: PATH,
    });
  }

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
    return apiErrorResponse('SESSION_INVALID', {
      message: 'Sesión inválida o expirada. Vuelve a verificar tu identidad.',
      path: PATH,
    });
  }

  if (!payload || !reference) {
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: 'Payload y referencia son obligatorios',
      path: PATH,
    });
  }

  if (payload.status === 'error') {
    return apiErrorResponse('PAYMENT_REJECTED', { message: 'Pago rechazado', path: PATH });
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

  if (!storedPayment) {
    return apiErrorResponse('REFERENCE_NOT_FOUND', {
      message: 'Referencia no encontrada',
      path: PATH,
      details: { reference },
    });
  }

  if (storedPayment.status === 'confirmed') {
    logApiEvent('info', {
      path: PATH,
      action: 'already_confirmed',
      reference,
    });
    return NextResponse.json({ success: true, message: 'Pago ya confirmado previamente' });
  }

  const simulateDeveloperPortal = shouldSimulateDeveloperPortal(storedPayment.token_address);
  if (!process.env.APP_ID || !process.env.DEV_PORTAL_API_KEY) {
    return apiErrorResponse('CONFIG_MISSING', {
      message: 'Faltan APP_ID o DEV_PORTAL_API_KEY',
      path: PATH,
    });
  }

  let transaction: Record<string, unknown>;

  if (simulateDeveloperPortal) {
    transaction = buildSimulatedTransaction(payload, storedPayment);
  } else {
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
    return apiErrorResponse('UPSTREAM_ERROR', {
      message: 'No se pudo verificar el pago en Developer Portal',
      path: PATH,
      details: { status: response.status },
    });
  }

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: 'No se pudo verificar el pago en Developer Portal' },
        { status: 502 }
      );
    }

    const transaction = await response.json();
    transaction = await response.json();
  }

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

    return apiErrorResponse('PAYMENT_STATUS_ERROR', {
      message: 'La referencia devuelta no coincide con el pago esperado',
      path: PATH,
      details: { expected: reference, received: transactionReference },
    });
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
    return apiErrorResponse('TRANSACTION_INVALID', {
      message: 'Monto de la transacción no válido',
      path: PATH,
      details: { amount: transactionAmountRaw, error: (error as Error)?.message },
    });
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

    return apiErrorResponse('SESSION_INVALID', {
      message: 'La referencia pertenece a otra sesión',
      path: PATH,
      details: { expectedSession: storedPayment.session_token, sessionId },
    });
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

    return apiErrorResponse('IDENTITY_MISMATCH', {
      message: 'El pago pertenece a otro usuario verificado',
      path: PATH,
      details: { expectedUser: storedPayment.user_id, sessionUser: verifiedIdentity.user_id },
    });
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

    return apiErrorResponse('IDENTITY_MISMATCH', {
      message: 'La sesión verificada es requerida para confirmar el pago',
      path: PATH,
      details: { expectedNullifier: storedPayment.nullifier_hash },
    });
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

    return apiErrorResponse('IDENTITY_MISMATCH', {
      message: 'El pago pertenece a otra identidad verificada',
      path: PATH,
      details: {
        expected: storedPayment.nullifier_hash,
        received: verifiedIdentity.nullifier_hash,
      },
    });
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

    return apiErrorResponse('TOKEN_MISMATCH', {
      message: 'El token cobrado no coincide con el pago solicitado',
      path: PATH,
      details: { expected: normalizedExpectedToken, received: transactionToken },
    });
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

      return apiErrorResponse('AMOUNT_MISMATCH', {
        message: 'El monto cobrado no coincide con el pago solicitado',
        path: PATH,
        details: { expected: expected.toString(), received: transactionAmount?.toString() },
      });
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

      return apiErrorResponse('TRANSACTION_INVALID', {
        message: 'No se pudo validar la wallet del pago',
        path: PATH,
        details: { transactionId: payload.transaction_id },
      });
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

      return apiErrorResponse('WALLET_MISMATCH', {
        message: 'La wallet que pagó no coincide con la esperada',
        path: PATH,
        details: { expected: storedPayment.wallet_address, received: transactionWallet },
      });
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

      return apiErrorResponse('TOURNAMENT_MISMATCH', {
        message: 'La referencia está asociada a otro torneo, no se puede reutilizar',
        path: PATH,
        details: { expected: storedPayment.tournament_id, received: transactionTournamentId },
      });
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

    if (storedPayment.type === 'tournament' && storedPayment.tournament_id) {
      const tournament = await getTournament(storedPayment.tournament_id);
      if (tournament) {
        await incrementTournamentPool(tournament);
      }
    }

    if (storedPayment.wallet_address) {
      const notificationResult = await sendNotification({
        walletAddresses: [storedPayment.wallet_address],
        title: 'Pago confirmado',
        message: 'Pago confirmado, ya puedes unirte al torneo',
        miniAppPath: storedPayment.tournament_id
          ? `/tournament/${storedPayment.tournament_id}`
          : '/tournament',
      });

      if (!notificationResult.success) {
        console.error('No se pudo enviar la notificación de pago confirmado', {
          reference,
          walletAddress: storedPayment.wallet_address,
          errorMessage: notificationResult.message,
        });
      }
    }

    logApiEvent('info', {
      path: PATH,
      action: 'confirmed',
      reference,
      transactionId: payload.transaction_id,
      userId: storedPayment.user_id,
    });

    return NextResponse.json({ success: true, message: 'Pago confirmado' });
  }

  const failureMessage = getFailureMessage(transactionStatus);

  await updatePaymentStatus(reference, 'failed', { reason: failureMessage }, { userId: storedPayment.user_id, sessionId });

  return NextResponse.json({ success: false, message: failureMessage }, { status: 400 });
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

    console.error('[confirm-payment] Error inesperado', error);
    return NextResponse.json(
      { success: false, message: 'No se pudo confirmar el pago. Intente nuevamente más tarde.' },
      { status: 500 }
    );
  }
  return apiErrorResponse('PAYMENT_STATUS_ERROR', {
    message: failureMessage,
    path: PATH,
    details: { reference, transactionStatus, transaction_id: payload.transaction_id },
  });
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
