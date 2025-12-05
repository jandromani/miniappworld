import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import { getTournament, serializeTournament } from '@/lib/server/tournamentData';

export async function GET(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const tournament = await getTournament(params.tournamentId);

  if (!tournament) {
    return apiErrorResponse('NOT_FOUND', {
      message: 'Torneo no encontrado',
      details: { tournamentId: params.tournamentId },
      path: 'tournaments/[tournamentId]',
    });
  }

  const serialized = await serializeTournament(tournament);

  logApiEvent('info', {
    path: 'tournaments/[tournamentId]',
    action: 'detail',
    tournamentId: params.tournamentId,
  });

  return NextResponse.json(serialized);
}
