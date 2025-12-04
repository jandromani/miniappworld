import { NextRequest, NextResponse } from 'next/server';
import { listTournaments, serializeTournament } from '@/lib/server/tournamentData';

export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilters = statusParam?.split(',').filter(Boolean);

  const tournaments = listTournaments(statusFilters);

  return NextResponse.json(tournaments.map(serializeTournament));
}
