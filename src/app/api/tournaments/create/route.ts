import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import { MEMECOIN_CONFIG, USDC_ADDRESS, WLD_ADDRESS } from '@/lib/constants';
import { findWorldIdVerificationBySession, recordAuditEvent, recordTournament } from '@/lib/database';
import { normalizeTokenIdentifier } from '@/lib/tokenNormalization';

const SUPPORTED_ADDRESSES = [
  normalizeTokenIdentifier(WLD_ADDRESS),
  normalizeTokenIdentifier(USDC_ADDRESS),
  normalizeTokenIdentifier(MEMECOIN_CONFIG.address),
];

const SESSION_COOKIE = 'session_token';
const MIN_BUY_IN = BigInt(1);
const MAX_BUY_IN = BigInt('1000000000000000000000000'); // 1e24 para evitar montos extremos
const MIN_DURATION_MS = 1000 * 60 * 5; // 5 minutos
const MAX_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

export async function POST(req: NextRequest) {
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    await recordAuditEvent({
      action: 'create_tournament',
      entity: 'tournaments',
      status: 'error',
      details: { reason: 'missing_session_token' },
    });
    return NextResponse.json({ error: 'Sesión no verificada' }, { status: 401 });
  }

  const sessionIdentity = await findWorldIdVerificationBySession(sessionToken);
  if (!sessionIdentity) {
    await recordAuditEvent({
      action: 'create_tournament',
      entity: 'tournaments',
      sessionId: sessionToken,
      status: 'error',
      details: { reason: 'session_not_found' },
    });
    return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
  }

  const {
    name,
    buyInToken,
    buyInAmount,
    maxPlayers,
    startTime,
    endTime,
    acceptedTokens,
    prizeDistribution,
  } = await req.json();

  if (!name || !buyInToken || !buyInAmount || !maxPlayers || !startTime || !endTime || !prizeDistribution) {
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: 'Missing required fields',
      path: 'tournaments/create',
    });
  }

  let normalizedBuyIn: string;
  let normalizedAccepted: string[];

  try {
    normalizedBuyIn = normalizeTokenIdentifier(String(buyInToken));
    normalizedAccepted = (acceptedTokens ?? [buyInToken]).map((token: string) =>
      normalizeTokenIdentifier(String(token))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const normalizedDistribution = Array.isArray(prizeDistribution)
    ? prizeDistribution.map((value: number) => Number(value))
    : [];

  const invalidDistribution =
    !Array.isArray(prizeDistribution) ||
    normalizedDistribution.length === 0 ||
    normalizedDistribution.some((value) => Number.isNaN(value));

  if (invalidDistribution) {
    return NextResponse.json({ error: 'Invalid prize distribution' }, { status: 400 });
  }

  const distributionTotal = normalizedDistribution.reduce((sum, value) => sum + value, 0);
  if (distributionTotal !== 100) {
    return NextResponse.json({ error: 'Prize distribution must add up to 100%' }, { status: 400 });
  }

  const expectedWinners = Number(maxPlayers);
  if (normalizedDistribution.length > expectedWinners) {
    return NextResponse.json({ error: 'Prize distribution exceeds expected winners' }, { status: 400 });
  }

  const invalid = [normalizedBuyIn, ...normalizedAccepted].find(
    (token) => !SUPPORTED_ADDRESSES.includes(token)
  );

  if (invalid) {
    return apiErrorResponse('UNSUPPORTED_TOKEN', {
      message: 'Token not supported',
      details: { token: invalid },
      path: 'tournaments/create',
    });
  }

  logApiEvent('info', {
    path: 'tournaments/create',
    action: 'create',
    tournamentName: name,
    buyInToken,
    maxPlayers,
  });

  let normalizedBuyInAmount: bigint;
  try {
    normalizedBuyInAmount = BigInt(buyInAmount);
  } catch (error) {
    return NextResponse.json({ error: 'buyInAmount debe ser un número entero' }, { status: 400 });
  }

  if (normalizedBuyInAmount < MIN_BUY_IN || normalizedBuyInAmount > MAX_BUY_IN) {
    return NextResponse.json(
      { error: 'El monto debe estar entre 1 y 1e24 (en unidades mínimas del token)' },
      { status: 400 }
    );
  }

  const parsedStart = new Date(startTime);
  const parsedEnd = new Date(endTime);

  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    return NextResponse.json({ error: 'Las fechas de inicio y fin son inválidas' }, { status: 400 });
  }

  const duration = parsedEnd.getTime() - parsedStart.getTime();

  if (duration < MIN_DURATION_MS) {
    return NextResponse.json({ error: 'La duración mínima del torneo es de 5 minutos' }, { status: 400 });
  }

  if (duration > MAX_DURATION_MS) {
    return NextResponse.json({ error: 'La duración del torneo no puede exceder 30 días' }, { status: 400 });
  }

  if (parsedEnd <= parsedStart) {
    return NextResponse.json({ error: 'La fecha de fin debe ser posterior a la de inicio' }, { status: 400 });
  }

  const tournamentId = `t-${randomUUID()}`;

  await recordTournament({
    tournament_id: tournamentId,
    name,
    buy_in_token: normalizedBuyIn,
    accepted_tokens: normalizedAccepted,
    buy_in_amount: normalizedBuyInAmount.toString(),
    prize_pool: '0',
    max_players: Number(maxPlayers),
    start_time: parsedStart.toISOString(),
    end_time: parsedEnd.toISOString(),
    status: 'upcoming',
    prize_distribution: prizeDistribution,
  });

  await recordAuditEvent({
    action: 'create_tournament',
    entity: 'tournaments',
    entityId: tournamentId,
    userId: sessionIdentity.user_id,
    sessionId: sessionToken,
    status: 'success',
    details: {
      buyInToken: normalizedBuyIn,
      buyInAmount: normalizedBuyInAmount.toString(),
      startTime: parsedStart.toISOString(),
      endTime: parsedEnd.toISOString(),
    },
  });

  return NextResponse.json(
    {
      success: true,
      tournament: {
        tournamentId,
        name,
        buyInToken: normalizedBuyIn,
        buyInAmount: normalizedBuyInAmount.toString(),
        maxPlayers,
        startTime: parsedStart.toISOString(),
        endTime: parsedEnd.toISOString(),
        acceptedTokens: normalizedAccepted,
        prizeDistribution,
        status: 'upcoming',
        prizePool: '0',
      },
    },
    { status: 201 }
  );
}
