import { NextRequest, NextResponse } from 'next/server';
import { logApiEvent } from '@/lib/apiError';
import { listTournaments, serializeTournament } from '@/lib/server/tournamentData';

export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilters = statusParam?.split(',').filter(Boolean);

  const tournaments = await listTournaments(statusFilters);
  const serialized = await Promise.all(tournaments.map((tournament) => serializeTournament(tournament)));

  logApiEvent('info', {
    path: 'tournaments',
    action: 'list',
    filters: statusFilters,
    count: serialized.length,
  });

  return NextResponse.json(serialized);
}
