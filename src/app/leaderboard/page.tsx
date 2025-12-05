'use client';

import { useEffect, useState } from 'react';

import { sanitizeText } from '@/lib/sanitize';

type GlobalLeaderboardEntry = {
  rank: number;
  username: string;
  totalPoints: number;
  tournamentsWon: number;
  totalEarnings: { token: 'WLD' | 'USDC'; amount: string };
  isCurrentUser?: boolean;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/leaderboard/global', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('No se pudo cargar el leaderboard');
        }
        const data = (await response.json()) as GlobalLeaderboardEntry[];
        setEntries(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error inesperado al cargar leaderboard';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <main className="p-6 flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Leaderboard global</h1>
        <p className="text-gray-600">
          Ranking acumulado de todos los torneos: puntaje, victorias y ganancias.
        </p>
      </header>

      {loading && <p>Cargando leaderboard...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Puntos</th>
                <th className="px-4 py-3">Torneos ganados</th>
                <th className="px-4 py-3">Ganancias</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                    Aún no hay datos en el leaderboard global.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr
                  key={entry.rank}
                  className={`border-t ${entry.isCurrentUser ? 'bg-blue-50 font-semibold' : ''}`}
                >
                  <td className="px-4 py-3">{entry.rank}</td>
                  <td className="px-4 py-3">{sanitizeText(entry.username) || 'Usuario'}</td>
                  <td className="px-4 py-3">{entry.totalPoints}</td>
                  <td className="px-4 py-3">{entry.tournamentsWon}</td>
                  <td className="px-4 py-3">
                    {entry.totalEarnings.amount} {entry.totalEarnings.token}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
