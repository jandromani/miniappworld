import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import { getTournament, serializeTournament } from '@/lib/server/tournamentData';

const TOURNAMENT_DETAIL_CACHE_CONTROL = 'public, max-age=120, stale-while-revalidate=600';
export const revalidate = 120;

export async function GET(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const tournament = await getTournament(params.tournamentId);

  if (!tournament) {
    return apiErrorResponse('NOT_FOUND', {
      message: 'Torneo no encontrado',
      details: { tournamentId: params.tournamentId },
      path: 'tournaments/[tournamentId]',
    });
  }

  return NextResponse.json(await serializeTournament(tournament), {
    headers: { 'Cache-Control': TOURNAMENT_DETAIL_CACHE_CONTROL },
  });
  const serialized = await serializeTournament(tournament);

  logApiEvent('info', {
    path: 'tournaments/[tournamentId]',
    action: 'detail',
    tournamentId: params.tournamentId,
  });

  return NextResponse.json(serialized);
}
