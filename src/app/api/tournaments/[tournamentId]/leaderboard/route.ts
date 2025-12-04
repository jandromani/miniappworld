import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboardEntries, getTournament } from '@/lib/server/tournamentData';

export async function GET(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const tournament = await getTournament(params.tournamentId);

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  const leaderboard = await getLeaderboardEntries(
    tournament.tournamentId,
    tournament.prizePool,
    tournament.prizeDistribution
  );

  return NextResponse.json(leaderboard);
}
