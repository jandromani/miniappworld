import tournamentsConfig from '@/config/tournaments.json';
import { SUPPORTED_TOKENS, SupportedToken } from '@/lib/constants';
import {
  addTournamentParticipant,
  listTournamentParticipants,
  listTournamentRecords,
  listTournamentResults,
  normalizeTournamentRecord,
  TournamentRecord,
  updateTournamentResultAndPool,
  upsertTournamentResult,
  findTournamentRecord,
  recordTournament,
} from '@/lib/database';
import { LeaderboardEntry, Tournament } from '@/lib/types';
import { normalizeTokenIdentifier } from '../tokenNormalization';

let seeded = false;

function resolveTournamentStatus(startTime: Date, endTime: Date): Tournament['status'] {
  const now = new Date();

  if (now < startTime) return 'upcoming';
  if (now >= startTime && now <= endTime) return 'active';
  return 'finished';
}

function toTournamentModel(record: TournamentRecord, currentPlayers: number): Tournament {
  const startTime = new Date(record.start_time);
  const endTime = new Date(record.end_time);
  return {
    tournamentId: record.tournament_id,
    name: record.name,
    buyInToken: record.buy_in_token,
    acceptedTokens: record.accepted_tokens,
    buyInAmount: record.buy_in_amount,
    prizePool: record.prize_pool,
    maxPlayers: record.max_players,
    currentPlayers,
    startTime,
    endTime,
    status: resolveTournamentStatus(startTime, endTime),
    prizeDistribution: record.prize_distribution,
  };
}

async function seedTournaments() {
  if (seeded) return;
  const existing = await listTournamentRecords();

  const existingIds = new Set(existing.map((entry) => entry.tournament_id));
  const seeds = tournamentsConfig.tournaments.map((config, index) => {
    const baseRecord: TournamentRecord = normalizeTournamentRecord({
      tournament_id: config.tournamentId,
      name: config.name,
      buy_in_token: config.buyInToken,
      accepted_tokens: config.acceptedTokens?.length ? config.acceptedTokens : [config.buyInToken],
      buy_in_amount: config.buyInAmount,
      prize_pool: config.prizePool ?? '0',
      max_players: config.maxPlayers,
      start_time: config.startTime,
      end_time: config.endTime,
      status: 'upcoming',
      prize_distribution: config.prizeDistribution,
    });

    return { baseRecord, index };
  });

  await Promise.all(
    seeds.map(async ({ baseRecord, index }) => {
      if (!existingIds.has(baseRecord.tournament_id)) {
        await recordTournament(baseRecord);
        // Seed leaderboard baseline so leaderboards are not empty
        const baseScore = 1500 - index * 100;
        await upsertTournamentResult({
          tournament_id: baseRecord.tournament_id,
          user_id: `${baseRecord.tournament_id}-user-1`,
          score: baseScore,
          prize: undefined,
        }, { skipUserValidation: true });
        await upsertTournamentResult({
          tournament_id: baseRecord.tournament_id,
          user_id: `${baseRecord.tournament_id}-user-2`,
          score: baseScore - 50,
          prize: undefined,
        }, { skipUserValidation: true });
      }
    })
  );

  seeded = true;
}

function calculatePrizeAmount(prizePool: string, percentage: number) {
  const pool = BigInt(prizePool ?? '0');
  return ((pool * BigInt(percentage)) / BigInt(100)).toString();
}

export async function serializeTournament(tournament: Tournament) {
  return {
    ...tournament,
    startTime: tournament.startTime.toISOString(),
    endTime: tournament.endTime.toISOString(),
  };
}

async function toTournamentList(statusFilters?: string[]) {
  await seedTournaments();
  const records = await listTournamentRecords();
  const participants = await Promise.all(records.map((entry) => listTournamentParticipants(entry.tournament_id)));

  const tournaments = records.map((record, index) =>
    toTournamentModel(record, participants[index]?.length ?? 0)
  );

  if (!statusFilters?.length) return tournaments;

  const normalized = statusFilters.map((status) => status.trim().toLowerCase());

  return tournaments.filter((tournament) => normalized.includes(tournament.status.toLowerCase()));
}

export async function listTournaments(statusFilters?: string[]) {
  return toTournamentList(statusFilters);
}

export async function getTournament(tournamentId: string): Promise<Tournament | null> {
  await seedTournaments();
  const record = await findTournamentRecord(tournamentId);
  if (!record) return null;

  const participants = await listTournamentParticipants(tournamentId);
  return toTournamentModel(record, participants.length);
}

export async function getLeaderboardEntries(
  tournamentId: string,
  prizePool: string,
  distribution: number[]
): Promise<LeaderboardEntry[]> {
  await seedTournaments();
  const entries = await listTournamentResults(tournamentId);

  return entries
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({
      rank: index + 1,
      userId: entry.user_id,
      username: entry.user_id,
      walletAddress: SUPPORTED_TOKENS.WLD.address,
      score: entry.score,
      prize: index < distribution.length ? calculatePrizeAmount(prizePool, distribution[index]) : entry.prize,
    }));
}

export async function updateTournamentPoolAndLeaderboardEntry(
  tournament: Tournament,
  entry: Omit<LeaderboardEntry, 'rank'>
) {
  await seedTournaments();
  const { tournament: updatedRecord } = await updateTournamentResultAndPool(
    tournament.tournamentId,
    {
      user_id: entry.userId,
      score: entry.score,
      prize: entry.prize,
    },
    { userId: entry.userId }
  );

  const participants = await listTournamentParticipants(tournament.tournamentId);
  return toTournamentModel(updatedRecord, participants.length);
}

export function validateTokenForTournament(
  tournament: Tournament,
  token: SupportedToken,
  amount: number | string
): { valid: boolean; message?: string } {
  const tokenConfig = SUPPORTED_TOKENS[token];
  if (!tokenConfig) return { valid: false, message: 'Token no soportado' };

  const accepted = tournament.acceptedTokens?.length ? tournament.acceptedTokens : [tournament.buyInToken];
  const lowerAccepted = accepted.map((addr) => normalizeTokenIdentifier(addr));

  if (!lowerAccepted.includes(normalizeTokenIdentifier(tokenConfig.address))) {
    return { valid: false, message: 'El token seleccionado no es aceptado para este torneo' };
  }

  const normalizedAmount = typeof amount === 'string' ? amount : amount.toString();
  const expected = BigInt(tournament.buyInAmount);
  const incoming = BigInt(normalizedAmount);

  if (expected !== incoming) {
    return { valid: false, message: 'El buy-in no coincide con el monto requerido' };
  }

  return { valid: true };
}

export async function addParticipantRecord(tournamentId: string, userId: string, paymentReference: string) {
  await seedTournaments();
  await addTournamentParticipant({
    tournament_id: tournamentId,
    user_id: userId,
    payment_reference: paymentReference,
    joined_at: new Date().toISOString(),
    status: 'joined',
  }, { userId });
}

export async function participantExists(tournamentId: string, userId: string) {
  const participants = await listTournamentParticipants(tournamentId);
  return participants.some((entry) => entry.user_id === userId);
}
