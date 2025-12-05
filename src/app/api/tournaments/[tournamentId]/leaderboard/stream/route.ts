import { NextRequest, NextResponse } from 'next/server';
import { createSseResponse } from '@/lib/server/sse';
import { getLeaderboardEntries, getTournament } from '@/lib/server/tournamentData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const { searchParams } = new URL(req.url);
  const interval = Number(searchParams.get('interval') ?? 5000);

  const tournament = await getTournament(params.tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  return createSseResponse({
    producer: () =>
      getLeaderboardEntries(tournament.tournamentId, tournament.prizePool, tournament.prizeDistribution),
    intervalMs: interval,
    signal: req.signal,
  });
}
