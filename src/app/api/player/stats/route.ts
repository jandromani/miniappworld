import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/sessionValidation';
import { getPlayerStats } from '@/lib/server/playerStatsStore';

export async function GET(req: NextRequest) {
  const sessionResult = await requireActiveSession(req, { path: 'player/stats' });

  if ('error' in sessionResult) {
    return sessionResult.error;
  }

  const { identity } = sessionResult;

  try {
    const stats = await getPlayerStats(identity.user_id);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[player-stats] Error al obtener stats', error);
    return NextResponse.json({ error: 'No se pudieron cargar las estadísticas' }, { status: 500 });
  }
}
