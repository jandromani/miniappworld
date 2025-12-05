import tournamentsConfig from '@/config/tournaments.json';
import { LeaderboardEntry, Tournament } from './types';
import { payForTournament } from './paymentService';
import { SupportedToken, resolveTokenFromAddress } from './constants';
import { fetchWithBackoff } from './fetchWithBackoff';
import { normalizeTokenIdentifier } from './tokenNormalization';

const BASE_PATH = '/api/tournaments';

function parseTournamentDates(tournament: Tournament): Tournament {
  return {
    ...tournament,
    startTime: new Date(tournament.startTime),
    endTime: new Date(tournament.endTime),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Error al comunicarse con el backend');
  }
  return response.json();
}

export async function getActiveTournaments(): Promise<Tournament[]> {
  const response = await fetchWithBackoff(`${BASE_PATH}?status=active,upcoming`, { timeoutMs: 4000 });
  const data = await handleResponse<Tournament[]>(response);

  return data
    .map(parseTournamentDates)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export async function getTournamentDetails(tournamentId: string): Promise<Tournament> {
  const response = await fetchWithBackoff(`${BASE_PATH}/${tournamentId}`, { timeoutMs: 4000 });
  const data = await handleResponse<Tournament>(response);

  return parseTournamentDates(data);
}

export async function joinTournament(
  tournamentId: string,
  token: SupportedToken,
  amount: number
): Promise<void> {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  if (!userId) {
    throw new Error('Debes verificar tu identidad antes de unirte al torneo');
  }

  const paymentResult = await payForTournament(token, amount, tournamentId);

  if (!paymentResult?.reference) {
    throw new Error('No se obtuvo referencia de pago');
  }

  const response = await fetchWithBackoff(`${BASE_PATH}/${tournamentId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, amount, userId, paymentReference: paymentResult.reference }),
    timeoutMs: 6000,
  });

  await handleResponse<void>(response);
}

export function resolveAcceptedTokens(tokens: string[] | undefined): SupportedToken[] {
  const normalized = (tokens ?? [])
    .map((token) => {
      try {
        return normalizeTokenIdentifier(token);
      } catch (error) {
        console.warn('Token no válido en configuración de torneo', token, error);
        return null;
      }
    })
    .filter(Boolean) as string[];

  const resolved = normalized
    .map((token) => resolveTokenFromAddress(token))
    .filter(Boolean) as SupportedToken[];

  if (resolved.length === 0) {
    return ['WLD'];
  }

  return Array.from(new Set(resolved));
}

export async function createTournamentFromConfig(configIndex: number) {
  const config = tournamentsConfig.tournaments[configIndex];

  if (!config) {
    throw new Error('Configuración de torneo no encontrada');
  }

  const response = await fetchWithBackoff('/api/tournaments/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    timeoutMs: 6000,
  });

  return handleResponse(response);
}

export async function getTournamentLeaderboard(
  tournamentId: string
): Promise<LeaderboardEntry[]> {
  const response = await fetchWithBackoff(`${BASE_PATH}/${tournamentId}/leaderboard`, {
    cache: 'no-store',
    timeoutMs: 4000,
  });
  const data = await handleResponse<LeaderboardEntry[]>(response);

  return data.map((entry, index) => ({
    ...entry,
    rank: entry.rank ?? index + 1,
  }));
}
