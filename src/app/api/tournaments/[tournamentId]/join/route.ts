import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import {
  addParticipantRecord,
  getTournament,
  participantExists,
  serializeTournament,
  validateTokenForTournament,
} from '@/lib/server/tournamentData';
import {
  findPaymentByReference,
  findWorldIdVerificationBySession,
  findWorldIdVerificationByUser,
  recordAuditEvent,
} from '@/lib/database';
import {
  isSupportedTokenAddress,
  isSupportedTokenSymbol,
  normalizeTokenIdentifier,
} from '@/lib/tokenNormalization';
import { rateLimit } from '@/lib/rateLimit';
import { sendNotification } from '@/lib/notificationService';

const SESSION_COOKIE = 'session_token';

type JoinParams = { tournamentId?: string; id?: string };

export async function POST(req: NextRequest, { params }: { params: JoinParams }) {
  const rateKey = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? 'global';
  const rate = await rateLimit(rateKey);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Límite de solicitudes alcanzado' }, { status: 429 });
  }

  const tournamentId = params.tournamentId ?? params.id;

  if (!tournamentId) {
    return NextResponse.json({ error: 'Torneo no especificado' }, { status: 400 });
  }

  const tournament = await getTournament(tournamentId);

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  const { token, amount, userId: bodyUserId, username, walletAddress, paymentReference } =
    await req.json();
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    await recordAuditEvent({
      action: 'join_tournament',
      entity: 'tournaments',
      entityId: tournamentId,
      status: 'error',
      details: { reason: 'missing_session_token', paymentReference },
    });
    return NextResponse.json(
      { error: 'Sesión no verificada. Vuelve a verificar tu identidad para continuar.' },
      { status: 401 },
    );
  }

  const sessionIdentity = await findWorldIdVerificationBySession(sessionToken);

  if (!sessionIdentity) {
    await recordAuditEvent({
      action: 'join_tournament',
      entity: 'tournaments',
      entityId: tournamentId,
      sessionId: sessionToken,
      status: 'error',
      details: { reason: 'session_not_found', paymentReference },
    });
    return NextResponse.json({ error: 'La sesión no es válida o expiró' }, { status: 401 });
  }

  if (bodyUserId && bodyUserId !== sessionIdentity.user_id) {
    return NextResponse.json({ error: 'El usuario no coincide con la sesión activa' }, { status: 403 });
  }

  const userId = sessionIdentity.user_id;

  const worldId = await findWorldIdVerificationByUser(userId);

  if (!worldId) {
    return NextResponse.json({ error: 'World ID no verificado para este usuario' }, { status: 403 });
  }

  if (!token || amount === undefined || !paymentReference) {
    return NextResponse.json({ error: 'Token, monto y referencia de pago son obligatorios' }, { status: 400 });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser un número positivo' }, { status: 400 });
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

  let payment;
  try {
    payment = await findPaymentByReference(paymentReference);
  } catch (error) {
    console.error('[join_tournament] Error inesperado', error);
    return NextResponse.json({ error: 'Error interno al procesar la inscripción' }, { status: 500 });
  }

  if (!payment) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  }

  if (payment.status !== 'confirmed') {
    return NextResponse.json({ error: 'El pago no está confirmado aún' }, { status: 400 });
  }

  if (payment.tournament_id && payment.tournament_id !== tournament.tournamentId) {
    return NextResponse.json({ error: 'El pago está asociado a otro torneo' }, { status: 400 });
  }

  if (payment.session_token && payment.session_token !== sessionToken) {
    return NextResponse.json({ error: 'La referencia de pago no pertenece a esta sesión' }, { status: 403 });
  }

  if (payment.user_id && payment.user_id !== worldId.user_id) {
    return NextResponse.json({ error: 'El pago pertenece a otro usuario' }, { status: 403 });
  }

  if (payment.nullifier_hash && payment.nullifier_hash !== worldId.nullifier_hash) {
    return NextResponse.json({ error: 'La verificación de identidad no coincide con el pago' }, { status: 403 });
  }

  const paymentWallet = payment.wallet_address?.toLowerCase();
  const verifiedWallet = worldId.wallet_address?.toLowerCase();

  if (paymentWallet && !verifiedWallet) {
    return NextResponse.json({ error: 'La wallet verificada no coincide con la del pago' }, { status: 403 });
  }

  if (paymentWallet && verifiedWallet && paymentWallet !== verifiedWallet) {
    return NextResponse.json({ error: 'La wallet verificada no coincide con la del pago' }, { status: 403 });
  }

  if (paymentWallet && walletAddress && paymentWallet !== walletAddress.toLowerCase()) {
    return NextResponse.json({ error: 'La wallet proporcionada no coincide con el pago' }, { status: 403 });
  }

  if (walletAddress && verifiedWallet && walletAddress.toLowerCase() !== verifiedWallet) {
    return NextResponse.json({ error: 'La wallet proporcionada no coincide con la verificada' }, { status: 403 });
  }

  if (
    typeof token !== 'string' ||
    (!isSupportedTokenSymbol(token) && !isSupportedTokenAddress(token))
  ) {
    return NextResponse.json({ error: 'Token no soportado' }, { status: 400 });
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

  const refreshedTournament = await getTournament(tournament.tournamentId);

  if (!refreshedTournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });
  }

  if (refreshedTournament.currentPlayers >= refreshedTournament.maxPlayers) {
    return NextResponse.json({ error: 'No hay cupos disponibles' }, { status: 400 });
  }

  const participantWallet = walletAddress ?? worldId.wallet_address ?? payment.wallet_address;

  await addParticipantRecord(tournament.tournamentId, userId, paymentReference, participantWallet);

  const updatedTournament = (await getTournament(tournament.tournamentId)) ?? tournament;

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
