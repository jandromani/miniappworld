import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { userId, message } = await req.json();

  // TODO: Integrar con servicio de notificaciones real
  console.log('Notificación enviada', { userId, message });

  return NextResponse.json({ success: true });
}
