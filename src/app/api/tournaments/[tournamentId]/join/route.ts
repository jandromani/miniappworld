import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import {
  addParticipantRecord,
  appendLeaderboardEntry,
  getTournament,
  incrementTournamentPool,
  participantExists,
  serializeTournament,
  validateTokenForTournament,
} from '@/lib/server/tournamentData';
import { findPaymentByReference, findWorldIdVerificationByUser } from '@/lib/database';
import { normalizeTokenIdentifier } from '@/lib/tokenNormalization';
import { rateLimit } from '@/lib/rateLimit';
import { sendNotification } from '@/lib/notificationService';

export async function POST(req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const rateKey = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? 'global';
  const rate = rateLimit(rateKey);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Límite de solicitudes alcanzado' }, { status: 429 });
  }

  const tournament = await getTournament(params.tournamentId);

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  const { token, amount, userId: bodyUserId, username, walletAddress, score, paymentReference } = await req.json();
  const userId = req.headers.get('x-user-id') ?? bodyUserId;

  if (!userId) {
    return NextResponse.json({ error: 'Usuario no autenticado' }, { status: 401 });
  }

  const worldId = await findWorldIdVerificationByUser(userId);
  if (!worldId) {
    return NextResponse.json({ error: 'World ID no verificado para este usuario' }, { status: 403 });
  }

  if (!token || amount === undefined || !paymentReference) {
    return NextResponse.json({ error: 'Token, monto y referencia de pago son obligatorios' }, { status: 400 });
  }

  if (tournament.status !== 'upcoming') {
    return NextResponse.json({ error: 'El torneo ya inició o finalizó' }, { status: 400 });
  }

  if (tournament.currentPlayers >= tournament.maxPlayers) {
    return NextResponse.json({ error: 'No hay cupos disponibles' }, { status: 400 });
  }

  if (await participantExists(tournament.tournamentId, userId)) {
    return NextResponse.json({ error: 'El usuario ya está inscrito en este torneo' }, { status: 400 });
  }

  const payment = await findPaymentByReference(paymentReference);
  if (!payment) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  }

  if (payment.status !== 'confirmed') {
    return NextResponse.json({ error: 'El pago no está confirmado aún' }, { status: 400 });
  }

  if (payment.tournament_id && payment.tournament_id !== tournament.tournamentId) {
    return NextResponse.json({ error: 'El pago está asociado a otro torneo' }, { status: 400 });
  }

  if (payment.user_id && payment.user_id !== userId) {
    return NextResponse.json({ error: 'El pago pertenece a otro usuario' }, { status: 403 });
  }

  const normalizedToken = normalizeTokenIdentifier(token);
  const tokenKey = resolveTokenFromAddress(normalizedToken) as SupportedToken;
  if (!tokenKey || !SUPPORTED_TOKENS[tokenKey]) {
    return NextResponse.json({ error: 'Token no soportado' }, { status: 400 });
  }

  const validation = validateTokenForTournament(tournament, tokenKey, payment.token_amount);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  await addParticipantRecord(tournament.tournamentId, userId, paymentReference);

  const updatedTournament = await incrementTournamentPool(tournament);
  await appendLeaderboardEntry(tournament.tournamentId, {
    userId,
    username: username ?? 'Nuevo jugador',
    walletAddress: walletAddress ?? payment.wallet_address ?? SUPPORTED_TOKENS[tokenKey].address,
    score: Number.isFinite(score) ? Number(score) : 0,
  });

  if (walletAddress) {
    await sendNotification({
      walletAddresses: [walletAddress],
      title: 'Inscripción confirmada',
      message: 'Te has unido al torneo correctamente',
      miniAppPath: `/tournament/${tournament.tournamentId}`,
    });
  }

  return NextResponse.json({
    success: true,
    tournament: await serializeTournament(updatedTournament),
  });
}
