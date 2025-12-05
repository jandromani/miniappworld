import { NextRequest, NextResponse } from 'next/server';
import { listTournaments, serializeTournament } from '@/lib/server/tournamentData';
import { validateCriticalEnvVars } from '@/lib/envValidation';

export async function GET(req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilters = statusParam?.split(',').filter(Boolean);

  const tournaments = await listTournaments(statusFilters);
  const serialized = await Promise.all(tournaments.map((tournament) => serializeTournament(tournament)));

  return NextResponse.json(serialized);
}
