import { NextRequest, NextResponse } from 'next/server';
import { MiniAppPaymentSuccessPayload } from '@worldcoin/minikit-js';
import { getPayment, updatePaymentStatus } from '../initiate-payment/route';

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

  const storedPayment = getPayment(reference);

  if (!storedPayment) {
    return NextResponse.json({ success: false, message: 'Referencia no encontrada' }, { status: 400 });
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

  // 3. Verificar que el pago no falló
  if (transaction.reference === reference && transaction.transaction_status !== 'failed') {
    updatePaymentStatus(reference, 'confirmed');
    // TODO: Persistir actualización en la base de datos
    // await db.payments.update({ reference }, { status: 'confirmed' })
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 400 });
}
