import { NextRequest, NextResponse } from 'next/server';
import { findWorldIdVerificationBySession } from '@/lib/database';
import { getPlayerStats } from '@/lib/server/playerStatsStore';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('session_token');

  if (!session) {
    return NextResponse.json({ error: 'Usuario no verificado' }, { status: 401 });
  }

  const identity = await findWorldIdVerificationBySession(session.value);
  if (!identity) {
    return NextResponse.json({ error: 'Sesión expirada o inválida' }, { status: 401 });
  }

  try {
    const stats = await getPlayerStats(identity.user_id);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[player-stats] Error al obtener stats', error);
    return NextResponse.json({ error: 'No se pudieron cargar las estadísticas' }, { status: 500 });
  }
}
