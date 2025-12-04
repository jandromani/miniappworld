import { NextRequest, NextResponse } from 'next/server';
import { createPayment, findPayment, PaymentRecord } from '@/lib/paymentStore';

export async function POST(req: NextRequest) {
  const { reference, type, token, amount, tournamentId } = await req.json();

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

  const existingPayment = await findPayment(reference);

  if (existingPayment) {
    return NextResponse.json(
      { success: false, message: 'Referencia duplicada' },
      { status: 400 }
    );
  }

  const record: Omit<PaymentRecord, 'createdAt' | 'updatedAt'> = {
    reference,
    type,
    token,
    amount,
    status: 'pending',
    tournamentId,
  };

  await createPayment(record);

  console.log('Pago iniciado:', { reference, type, token, amount, tournamentId });

  return NextResponse.json({ success: true, reference, tournamentId });
}
