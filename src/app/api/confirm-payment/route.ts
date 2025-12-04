import { NextRequest, NextResponse } from 'next/server';
import { MiniAppPaymentSuccessPayload } from '@worldcoin/minikit-js';

export async function POST(req: NextRequest) {
  const { payload, reference } = (await req.json()) as {
    payload: MiniAppPaymentSuccessPayload;
    reference: string;
  };

  // 1. Verificar que la referencia coincide
  // TODO: const storedPayment = await db.payments.findOne({ reference })
  // if (!storedPayment) return NextResponse.json({ success: false }, { status: 400 })

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

  const transaction = await response.json();

  // 3. Verificar que el pago no falló
  if (transaction.reference === reference && transaction.transaction_status !== 'failed') {
    // TODO: Actualizar estado en DB
    // await db.payments.update({ reference }, { status: 'confirmed' })
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 400 });
}
