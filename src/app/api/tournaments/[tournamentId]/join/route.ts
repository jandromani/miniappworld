import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import {
  addParticipantRecord,
  getTournament,
  participantExists,
  updateTournamentPoolAndLeaderboardEntry,
  serializeTournament,
} from '@/lib/server/tournamentData';
import { findPaymentByReference, isLocalStorageDisabled } from '@/lib/database';
import { isSupportedTokenAddress, isSupportedTokenSymbol, normalizeTokenIdentifier } from '@/lib/tokenNormalization';
import { rateLimit } from '@/lib/rateLimit';
import { sendNotification } from '@/lib/notificationService';
import { requireActiveSession } from '@/lib/sessionValidation';

const PATH = 'join_tournament';

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

  const { token, amount, userId: bodyUserId, username, walletAddress, score, paymentReference } = await req.json();

  const sessionResult = await requireActiveSession(req, {
    path: PATH,
    audit: {
      action: 'join_tournament',
      entity: 'tournaments',
      entityId: tournamentId,
      details: { paymentReference },
    },
  });

  if ('error' in sessionResult) {
    return sessionResult.error;
  }

  const { identity, sessionToken } = sessionResult;

  if (bodyUserId && bodyUserId !== identity.user_id) {
    return NextResponse.json({ error: 'El usuario no coincide con la sesión activa' }, { status: 403 });
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

  if (await participantExists(tournament.tournamentId, identity.user_id)) {
    return NextResponse.json({ error: 'El usuario ya está inscrito en este torneo' }, { status: 400 });
  }

  if (typeof token !== 'string' || (!isSupportedTokenSymbol(token) && !isSupportedTokenAddress(token))) {
    return NextResponse.json({ error: 'Token no soportado' }, { status: 400 });
  }

  const normalizedToken = normalizeTokenIdentifier(token);
  const tokenKey = resolveTokenFromAddress(normalizedToken) as SupportedToken;
  if (!tokenKey || !SUPPORTED_TOKENS[tokenKey]) {
    return NextResponse.json({ error: 'Token no soportado' }, { status: 400 });
  }

  const decimals = SUPPORTED_TOKENS[tokenKey].decimals;
  const expectedAmount = BigInt(Math.round(numericAmount * 10 ** decimals)).toString();

  const payment = await findPaymentByReference(paymentReference);
  if (!payment) {
    return NextResponse.json({ error: 'Referencia de pago no encontrada' }, { status: 404 });
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

  if (payment.user_id && payment.user_id !== identity.user_id) {
    return NextResponse.json({ error: 'El pago pertenece a otro usuario' }, { status: 403 });
  }

  if (payment.nullifier_hash && payment.nullifier_hash !== identity.nullifier_hash) {
    return NextResponse.json({ error: 'La verificación de identidad no coincide con el pago' }, { status: 403 });
  }

  const paymentWallet = payment.wallet_address?.toLowerCase();
  const verifiedWallet = identity.wallet_address?.toLowerCase();

  if (paymentWallet && verifiedWallet && paymentWallet !== verifiedWallet) {
    return NextResponse.json({ error: 'La wallet verificada no coincide con la del pago' }, { status: 403 });
  }

  if (paymentWallet && walletAddress && paymentWallet !== walletAddress.toLowerCase()) {
    return NextResponse.json({ error: 'La wallet proporcionada no coincide con el pago' }, { status: 403 });
  }

  if (walletAddress && verifiedWallet && walletAddress.toLowerCase() !== verifiedWallet) {
    return NextResponse.json({ error: 'La wallet proporcionada no coincide con la verificada' }, { status: 403 });
  }

  if (payment.token_address && normalizeTokenIdentifier(payment.token_address) !== normalizedToken) {
    return NextResponse.json({ error: 'El token enviado no coincide con el pago' }, { status: 403 });
  }

  if (payment.token_amount && payment.token_amount !== expectedAmount) {
    return NextResponse.json({ error: 'El monto enviado no coincide con el pago' }, { status: 403 });
  }

  const participantWallet = walletAddress ?? identity.wallet_address ?? payment.wallet_address;

  try {
    await addParticipantRecord(tournament.tournamentId, identity.user_id, paymentReference, participantWallet);
    const updatedTournament = await updateTournamentPoolAndLeaderboardEntry(tournament, {
      userId: identity.user_id,
      username: username ?? 'Nuevo jugador',
      walletAddress: participantWallet ?? SUPPORTED_TOKENS[tokenKey].address,
      score: Number.isFinite(Number(score)) ? Number(score) : 0,
      prize: undefined,
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
  } catch (error) {
    if (isLocalStorageDisabled(error)) {
      return NextResponse.json(
        { error: 'Persistencia local deshabilitada. Configure un directorio compartido o servicio de storage.' },
        { status: 503 }
      );
    }

    console.error('[join_tournament] Error inesperado', error);
    return NextResponse.json({ error: 'Error interno al procesar la inscripción' }, { status: 500 });
  }
}
