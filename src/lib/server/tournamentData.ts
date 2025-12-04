import tournamentsConfig from '@/config/tournaments.json';
import { SUPPORTED_TOKENS, SupportedToken } from '@/lib/constants';
import { LeaderboardEntry, Tournament } from '@/lib/types';

const tournamentStore = new Map<string, Tournament>();
const leaderboardStore = new Map<string, LeaderboardEntry[]>();

function resolveTournamentStatus(startTime: Date, endTime: Date): Tournament['status'] {
  const now = new Date();

  if (now < startTime) return 'upcoming';
  if (now >= startTime && now <= endTime) return 'active';
  return 'finished';
}

function parseConfigTournament(config: (typeof tournamentsConfig)['tournaments'][number]): Tournament {
  const startTime = new Date(config.startTime);
  const endTime = new Date(config.endTime);

  return {
    tournamentId: config.tournamentId,
    name: config.name,
    buyInToken: config.buyInToken,
    acceptedTokens: config.acceptedTokens?.length ? config.acceptedTokens : [config.buyInToken],
    buyInAmount: config.buyInAmount,
    prizePool: config.prizePool ?? '0',
    maxPlayers: config.maxPlayers,
    currentPlayers: 0,
    startTime,
    endTime,
    status: resolveTournamentStatus(startTime, endTime),
    prizeDistribution: config.prizeDistribution,
  };
}

function seedLeaderboards() {
  tournamentsConfig.tournaments.forEach((config, index) => {
    const baseScore = 1500 - index * 100;
    const entries: LeaderboardEntry[] = Array.from({ length: 3 }, (_, i) => ({
      rank: i + 1,
      userId: `${config.tournamentId}-user-${i + 1}`,
      username: `Jugador ${i + 1}`,
      walletAddress: SUPPORTED_TOKENS.WLD.address,
      score: baseScore - i * 75,
    }));

    leaderboardStore.set(config.tournamentId, entries);
  });
}

function initializeStore() {
  tournamentsConfig.tournaments.forEach((config) => {
    const parsed = parseConfigTournament(config);
    tournamentStore.set(parsed.tournamentId, parsed);
  });

  seedLeaderboards();
}

initializeStore();

function calculatePrizeAmount(prizePool: string, percentage: number) {
  const pool = BigInt(prizePool ?? '0');
  return ((pool * BigInt(percentage)) / BigInt(100)).toString();
}

function withDynamicFields(tournament: Tournament): Tournament {
  const leaderboardSize = leaderboardStore.get(tournament.tournamentId)?.length ?? 0;
  const startTime = new Date(tournament.startTime);
  const endTime = new Date(tournament.endTime);

  return {
    ...tournament,
    currentPlayers: Math.max(tournament.currentPlayers, leaderboardSize),
    startTime,
    endTime,
    status: resolveTournamentStatus(startTime, endTime),
  };
}

export function serializeTournament(tournament: Tournament) {
  return {
    ...tournament,
    startTime: tournament.startTime.toISOString(),
    endTime: tournament.endTime.toISOString(),
  };
}

export function listTournaments(statusFilters?: string[]): Tournament[] {
  const tournaments = Array.from(tournamentStore.values()).map(withDynamicFields);

  if (!statusFilters?.length) return tournaments;

  const normalized = statusFilters.map((status) => status.trim().toLowerCase());

  return tournaments.filter((tournament) => normalized.includes(tournament.status.toLowerCase()));
}

export function getTournament(tournamentId: string): Tournament | null {
  const tournament = tournamentStore.get(tournamentId);
  if (!tournament) return null;

  return withDynamicFields(tournament);
}

export function getLeaderboardEntries(tournamentId: string, prizePool: string, distribution: number[]): LeaderboardEntry[] {
  const entries = leaderboardStore.get(tournamentId) ?? [];

  return entries
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      prize: index < distribution.length ? calculatePrizeAmount(prizePool, distribution[index]) : undefined,
    }));
}

export function appendLeaderboardEntry(tournamentId: string, entry: Omit<LeaderboardEntry, 'rank'>) {
  const current = leaderboardStore.get(tournamentId) ?? [];
  const existsIndex = current.findIndex((item) => item.userId === entry.userId);
  if (existsIndex >= 0) {
    current[existsIndex] = { ...current[existsIndex], ...entry };
    leaderboardStore.set(tournamentId, current);
    return;
  }

  leaderboardStore.set(tournamentId, [...current, entry]);
}

export function incrementTournamentPool(tournament: Tournament) {
  const stored = tournamentStore.get(tournament.tournamentId);
  if (!stored) return tournament;

  const newPool = (BigInt(stored.prizePool ?? '0') + BigInt(stored.buyInAmount)).toString();
  const updated = { ...stored, prizePool: newPool, currentPlayers: stored.currentPlayers + 1 };
  tournamentStore.set(tournament.tournamentId, updated);
  return withDynamicFields(updated);
}

export function validateTokenForTournament(
  tournament: Tournament,
  token: SupportedToken,
  amount: number
): { valid: boolean; message?: string } {
  const tokenConfig = SUPPORTED_TOKENS[token];
  if (!tokenConfig) return { valid: false, message: 'Token no soportado' };

  const accepted = tournament.acceptedTokens?.length ? tournament.acceptedTokens : [tournament.buyInToken];
  const lowerAccepted = accepted.map((addr) => addr.toLowerCase());

  if (!lowerAccepted.includes(tokenConfig.address.toLowerCase())) {
    return { valid: false, message: 'El token seleccionado no es aceptado para este torneo' };
  }

  const requiredAmount = Number(tournament.buyInAmount) / 10 ** tokenConfig.decimals;
  const isCorrectAmount = Math.abs(requiredAmount - Number(amount)) < 1e-9;

  if (!isCorrectAmount) {
    return { valid: false, message: 'El buy-in no coincide con el monto requerido' };
  }

  return { valid: true };
}
