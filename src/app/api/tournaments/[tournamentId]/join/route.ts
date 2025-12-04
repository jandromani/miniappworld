import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_TOKENS, SupportedToken } from '@/lib/constants';
import {
  appendLeaderboardEntry,
  getTournament,
  incrementTournamentPool,
  serializeTournament,
  validateTokenForTournament,
} from '@/lib/server/tournamentData';

export async function POST(req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const tournament = getTournament(params.tournamentId);

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  const { token, amount, userId, username, walletAddress, score } = await req.json();

  if (!token || amount === undefined) {
    return NextResponse.json({ error: 'Token y monto son obligatorios' }, { status: 400 });
  }

  if (tournament.status !== 'upcoming') {
    return NextResponse.json({ error: 'El torneo ya inició o finalizó' }, { status: 400 });
  }

  if (tournament.currentPlayers >= tournament.maxPlayers) {
    return NextResponse.json({ error: 'No hay cupos disponibles' }, { status: 400 });
  }

  const tokenKey = token as SupportedToken;
  if (!SUPPORTED_TOKENS[tokenKey]) {
    return NextResponse.json({ error: 'Token no soportado' }, { status: 400 });
  }

  const validation = validateTokenForTournament(tournament, tokenKey, Number(amount));
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const updatedTournament = incrementTournamentPool(tournament);
  appendLeaderboardEntry(tournament.tournamentId, {
    userId: userId ?? `${tournament.tournamentId}-${Date.now()}`,
    username: username ?? 'Nuevo jugador',
    walletAddress: walletAddress ?? SUPPORTED_TOKENS[tokenKey].address,
    score: Number.isFinite(score) ? Number(score) : 0,
  });

  return NextResponse.json({
    success: true,
    tournament: serializeTournament(updatedTournament),
  });
}
