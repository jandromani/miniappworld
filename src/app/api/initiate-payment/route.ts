import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { reference, type, token, amount } = await req.json();

  // TODO: Guardar en base de datos (PostgreSQL, Supabase, etc.)
  // Ejemplo: await db.payments.create({ reference, type, token, amount, status: 'pending' })

  console.log('Pago iniciado:', { reference, type, token, amount });

  return NextResponse.json({ success: true, reference });
}
