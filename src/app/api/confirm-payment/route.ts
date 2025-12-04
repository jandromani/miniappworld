import { NextRequest, NextResponse } from 'next/server';
import { MiniAppPaymentSuccessPayload } from '@worldcoin/minikit-js';
import { findPayment, updatePayment } from '@/lib/paymentStore';

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

  const storedPayment = await findPayment(reference);

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
    await updatePayment(reference, {
      status: 'failed',
      lastError: 'Referencia devuelta no coincide con el pago iniciado',
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
  const transactionAmount = transactionAmountRaw !== undefined ? Number(transactionAmountRaw) : undefined;

  if (storedPayment.token && transactionToken && storedPayment.token !== transactionToken) {
    await updatePayment(reference, {
      status: 'failed',
      lastError: 'Token no coincide con el pago esperado',
    });

    return NextResponse.json(
      {
        success: false,
        message: 'El token cobrado no coincide con el pago solicitado',
      },
      { status: 400 }
    );
  }

  if (
    storedPayment.amount !== undefined &&
    transactionAmount !== undefined &&
    Number.isFinite(transactionAmount) &&
    storedPayment.amount !== transactionAmount
  ) {
    await updatePayment(reference, {
      status: 'failed',
      lastError: 'Monto no coincide con el pago esperado',
    });

    return NextResponse.json(
      { success: false, message: 'El monto cobrado no coincide con el pago solicitado' },
      { status: 400 }
    );
  }

  if (storedPayment.type === 'tournament') {
    const transactionTournamentId = transaction.tournamentId || transaction.tournament_id || transaction.metadata?.tournamentId;
    if (storedPayment.tournamentId && transactionTournamentId && storedPayment.tournamentId !== transactionTournamentId) {
      await updatePayment(reference, {
        status: 'failed',
        lastError: 'Referencia de torneo no coincide con el flujo solicitado',
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
    await updatePayment(reference, { status: 'confirmed', lastError: undefined });
    return NextResponse.json({ success: true, message: 'Pago confirmado' });
  }

  const failureMessage = getFailureMessage(transactionStatus);

  console.error('Error al confirmar pago', {
    reference,
    transactionStatus,
    transaction_id: payload.transaction_id,
  });

  await updatePayment(reference, { status: 'failed', lastError: failureMessage });

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
