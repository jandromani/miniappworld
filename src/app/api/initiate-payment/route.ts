import { NextRequest, NextResponse } from 'next/server';

type PaymentRecord = {
  reference: string;
  type: 'quick_match' | 'tournament';
  token?: string;
  amount?: number;
  status: 'pending' | 'confirmed';
};

// Base de datos en memoria para demostración
const payments = new Map<string, PaymentRecord>();

export async function POST(req: NextRequest) {
  const { reference, type, token, amount } = await req.json();

  if (!reference || !type) {
    return NextResponse.json(
      { success: false, message: 'Referencia y tipo son obligatorios' },
      { status: 400 }
    );
  }

  if (payments.has(reference)) {
    return NextResponse.json(
      { success: false, message: 'Referencia duplicada' },
      { status: 400 }
    );
  }

  const record: PaymentRecord = {
    reference,
    type,
    token,
    amount,
    status: 'pending',
  };

  payments.set(reference, record);

  // TODO: Persistir en base de datos (PostgreSQL, Supabase, etc.)
  // Ejemplo: await db.payments.create(record)

  console.log('Pago iniciado:', { reference, type, token, amount });

  return NextResponse.json({ success: true, reference });
}

export function getPayment(reference: string) {
  return payments.get(reference);
}

export function updatePaymentStatus(reference: string, status: PaymentRecord['status']) {
  const current = payments.get(reference);
  if (current) {
    payments.set(reference, { ...current, status });
  }
}
