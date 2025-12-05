import { NextRequest, NextResponse } from 'next/server';
import { listTournaments, serializeTournament } from '@/lib/server/tournamentData';

const TOURNAMENTS_CACHE_CONTROL = 'public, max-age=120, stale-while-revalidate=600';
export const revalidate = 120;

export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilters = statusParam?.split(',').filter(Boolean);

  const tournaments = await listTournaments(statusFilters);
  const serialized = await Promise.all(tournaments.map((tournament) => serializeTournament(tournament)));

  return NextResponse.json(serialized, {
    headers: { 'Cache-Control': TOURNAMENTS_CACHE_CONTROL },
  });
}
