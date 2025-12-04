import { Tokens } from '@worldcoin/minikit-js';
import { LeaderboardEntry, Tournament } from './types';
import { payForTournament } from './paymentService';

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
  const response = await fetch(`${BASE_PATH}?status=active,upcoming`, { cache: 'no-store' });
  const data = await handleResponse<Tournament[]>(response);

  return data
    .map(parseTournamentDates)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export async function getTournamentDetails(tournamentId: string): Promise<Tournament> {
  const response = await fetch(`${BASE_PATH}/${tournamentId}`, { cache: 'no-store' });
  const data = await handleResponse<Tournament>(response);

  return parseTournamentDates(data);
}

export async function joinTournament(tournamentId: string, token: Tokens, amount: number): Promise<void> {
  await payForTournament(token, amount);

  const response = await fetch(`${BASE_PATH}/${tournamentId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, amount }),
  });

  await handleResponse<void>(response);
}

export async function getTournamentLeaderboard(
  tournamentId: string
): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${BASE_PATH}/${tournamentId}/leaderboard`, { cache: 'no-store' });
  const data = await handleResponse<LeaderboardEntry[]>(response);

  return data.map((entry, index) => ({
    ...entry,
    rank: entry.rank ?? index + 1,
  }));
}
