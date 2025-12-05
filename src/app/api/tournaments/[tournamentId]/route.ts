import { NextRequest, NextResponse } from 'next/server';
import { getTournament, serializeTournament } from '@/lib/server/tournamentData';

const TOURNAMENT_DETAIL_CACHE_CONTROL = 'public, max-age=120, stale-while-revalidate=600';
export const revalidate = 120;

export async function GET(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const tournament = await getTournament(params.tournamentId);

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  return NextResponse.json(await serializeTournament(tournament), {
    headers: { 'Cache-Control': TOURNAMENT_DETAIL_CACHE_CONTROL },
  });
}
