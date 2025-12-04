import { NextRequest, NextResponse } from 'next/server';
import { MiniAppPaymentSuccessPayload } from '@worldcoin/minikit-js';
import { findPaymentByReference, updatePaymentStatus } from '@/lib/database';
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

  const transactionStatus = (transaction.transaction_status || transaction.status || '').toString().toLowerCase();
  const transactionReference = transaction.reference || transaction.transaction_reference;

  if (transactionReference !== reference) {
    await updatePaymentStatus(reference, 'failed', {
      reason: 'Referencia devuelta no coincide con el pago iniciado',
    });

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
    await updatePaymentStatus(reference, 'failed', { reason: 'Monto devuelto no es válido' });
    return NextResponse.json({ success: false, message: 'Monto de la transacción no válido' }, { status: 400 });
  }

  const normalizedExpectedToken = storedPayment.token_address
    ? normalizeTokenIdentifier(storedPayment.token_address)
    : undefined;

  if (
    normalizedExpectedToken &&
    transactionToken &&
    !tokensMatch(normalizedExpectedToken, normalizeTokenIdentifier(transactionToken))
  ) {
    await updatePaymentStatus(reference, 'failed', {
      reason: 'Token no coincide con el pago esperado',
    });

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
    if (expected !== transactionAmount) {
      await updatePaymentStatus(reference, 'failed', {
        reason: 'Monto no coincide con el pago esperado',
      });

      return NextResponse.json(
        { success: false, message: 'El monto cobrado no coincide con el pago solicitado' },
        { status: 400 }
      );
    }
  }

  if (storedPayment.type === 'tournament') {
    const transactionTournamentId = transaction.tournamentId || transaction.tournament_id || transaction.metadata?.tournamentId;
    if (storedPayment.tournament_id && transactionTournamentId && storedPayment.tournament_id !== transactionTournamentId) {
      await updatePaymentStatus(reference, 'failed', {
        reason: 'Referencia de torneo no coincide con el flujo solicitado',
      });

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
    await updatePaymentStatus(reference, 'confirmed', {
      transaction_id: payload.transaction_id,
      confirmed_at: confirmedAt,
    });

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

  await updatePaymentStatus(reference, 'failed', { reason: failureMessage });

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
