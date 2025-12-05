import { getTokenDecimalsByAddress, getTokenSymbolByAddress } from '@/lib/constants';
import { LeaderboardEntry } from '@/lib/types';
import { getLeaderboardEntries, listTournaments } from './tournamentData';

export type AggregatedLeaderboardEntry = LeaderboardEntry & {
  totalPoints: number;
  tournamentsWon: number;
  totalEarnings: { token: string; amount: string }[];
};

export async function getGlobalLeaderboard(): Promise<AggregatedLeaderboardEntry[]> {
  const tournaments = await listTournaments();
  const accumulator = new Map<
    string,
    {
      username: string;
      totalPoints: number;
      tournamentsWon: number;
      earnings: Map<string, bigint>;
    }
  >();

  for (const tournament of tournaments) {
    const leaderboard = await getLeaderboardEntries(
      tournament.tournamentId,
      tournament.prizePool,
      tournament.prizeDistribution
    );

    leaderboard.forEach((entry) => {
      const current = accumulator.get(entry.userId) ?? {
        username: entry.username,
        totalPoints: 0,
        tournamentsWon: 0,
        earnings: new Map<string, bigint>(),
      };

      current.totalPoints += entry.score;
      if (entry.rank === 1) current.tournamentsWon += 1;

      if (entry.prize) {
        const key = tournament.buyInToken;
        const currentPrize = current.earnings.get(key) ?? 0n;
        current.earnings.set(key, currentPrize + BigInt(entry.prize));
      }

      accumulator.set(entry.userId, current);
    });
  }

  const aggregated = Array.from(accumulator.entries()).map(([userId, entry]) => {
    const totalEarnings = Array.from(entry.earnings.entries()).map(([tokenAddress, amount]) => {
      const decimals = getTokenDecimalsByAddress(tokenAddress);
      const symbol = getTokenSymbolByAddress(tokenAddress);
      const human = Number(amount) / 10 ** decimals;
      const formatted = human >= 0.01 ? human.toFixed(2) : amount.toString();

      return { token: symbol, amount: formatted };
    });

    return {
      rank: 0,
      userId,
      username: entry.username || userId,
      walletAddress: '',
      score: entry.totalPoints,
      prize: undefined,
      totalPoints: entry.totalPoints,
      tournamentsWon: entry.tournamentsWon,
      totalEarnings,
    } satisfies AggregatedLeaderboardEntry;
  });

  aggregated.sort((a, b) => b.totalPoints - a.totalPoints);

  return aggregated.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}
