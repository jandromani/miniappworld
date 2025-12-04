import { NextRequest, NextResponse } from 'next/server';
import { getTournament, serializeTournament } from '@/lib/server/tournamentData';

export async function GET(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const tournament = getTournament(params.tournamentId);

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  return NextResponse.json(serializeTournament(tournament));
}
