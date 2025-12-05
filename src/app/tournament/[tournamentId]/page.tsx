'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LeaderboardEntry, Tournament } from '@/lib/types';
import {
  getTournamentDetails,
  getTournamentLeaderboard,
  joinTournament,
  resolveAcceptedTokens,
} from '@/lib/tournamentService';
import {
  MEMECOIN_CONFIG,
  SUPPORTED_TOKENS,
  SupportedToken,
  getTokenDecimalsByAddress,
  getTokenSymbolByAddress,
  resolveTokenFromAddress,
} from '@/lib/constants';

function formatToken(amount: string, tokenAddress: string) {
  const decimals = getTokenDecimalsByAddress(tokenAddress);
  const value = Number(amount) / 10 ** decimals;
  return value >= 0.01 ? `${value.toFixed(2)} ${getTokenSymbolByAddress(tokenAddress)}` : `${amount} (base)`;
}

function useTournamentData(tournamentId: string) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [details, positions] = await Promise.all([
          getTournamentDetails(tournamentId),
          getTournamentLeaderboard(tournamentId),
        ]);
        setTournament(details);
        setLeaderboard(positions.slice(0, 10));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo cargar el torneo';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tournamentId]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSse = () => {
      eventSource?.close();
      eventSource = new EventSource(`/api/tournaments/${tournamentId}/leaderboard/stream`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data) as LeaderboardEntry[];
        setLeaderboard(data.slice(0, 10));
        setError(null);
      };

      eventSource.onerror = () => {
        setError((current) => current ?? 'Conexión en vivo interrumpida, reintentando...');
        eventSource?.close();
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(connectSse, 4000);
      };
    };

    connectSse();

    return () => {
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [tournamentId]);

  return { tournament, leaderboard, loading, error };
}

export default function TournamentDetailsPage({ params }: { params: { tournamentId: string } }) {
  const router = useRouter();
  const { tournament, leaderboard, loading, error } = useTournamentData(params.tournamentId);
  const [joining, setJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<SupportedToken | null>(null);

  const acceptedTokens = useMemo(() => {
    if (!tournament) return [];
    const tokens = tournament.acceptedTokens?.length
      ? tournament.acceptedTokens
      : [tournament.buyInToken];

    const uniqueTokens = Array.from(new Set([tournament.buyInToken, ...tokens]));
    return resolveAcceptedTokens(uniqueTokens);
  }, [tournament]);

  useEffect(() => {
    if (!tournament) return;

    const preferredToken = resolveTokenFromAddress(tournament.buyInToken);
    setSelectedToken(preferredToken ?? acceptedTokens[0] ?? null);
  }, [acceptedTokens, tournament]);

  const canJoin = useMemo(
    () => tournament?.status === 'upcoming' && !joining && !!selectedToken,
    [tournament?.status, joining, selectedToken]
  );

  const canPlay = useMemo(
    () => tournament?.status === 'active' && (hasJoined || !!leaderboard.find((e) => e.isCurrentUser)),
    [tournament?.status, hasJoined, leaderboard]
  );

  const handleJoin = async () => {
    if (!tournament || !selectedToken) return;

    setJoining(true);
    setJoinError(null);

    try {
      const amount =
        Number(tournament.buyInAmount) / 10 ** SUPPORTED_TOKENS[selectedToken].decimals;
      await joinTournament(
        tournament.tournamentId,
        selectedToken,
        amount
      );
      setHasJoined(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al unirse al torneo';
      setJoinError(message);
    } finally {
      setJoining(false);
    }
  };

  const openTokenInPUF = () => {
    window.location.href = MEMECOIN_CONFIG.pufUrl;
  };

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Detalles del torneo</h1>
        <p className="text-gray-600">Consulta el prize pool, inscripciones y leaderboard en vivo.</p>
      </header>

      {loading && <p>Cargando información...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && tournament && (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{tournament.name}</h2>
                <p className="text-sm text-gray-500">Estado: {tournament.status}</p>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                Prize pool: {formatToken(tournament.prizePool, tournament.buyInToken)}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Buy-in</dt>
                <dd className="font-semibold">
                  {formatToken(tournament.buyInAmount, tournament.buyInToken)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Jugadores</dt>
                <dd className="font-semibold">
                  {tournament.currentPlayers}/{tournament.maxPlayers}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Inicio</dt>
                <dd className="font-semibold">{tournament.startTime.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fin</dt>
                <dd className="font-semibold">{tournament.endTime.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Distribución</dt>
                <dd className="font-semibold">{tournament.prizeDistribution.join('% / ')}%</dd>
              </div>
            </dl>

            {joinError && <p className="text-sm text-red-600">{joinError}</p>}

            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-sm font-medium">Tokens aceptados</p>
              <div className="flex flex-wrap gap-2">
                {acceptedTokens.map((token) => (
                  <button
                    key={token}
                    type="button"
                    className={`rounded border px-3 py-2 text-sm transition ${
                      selectedToken === token ? 'border-blue-600 bg-white' : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedToken(token)}
                    disabled={joining}
                  >
                    {SUPPORTED_TOKENS[token].symbol} — {SUPPORTED_TOKENS[token].name}
                  </button>
                ))}
              </div>

              {acceptedTokens.includes('MEMECOIN') && (
                <button
                  type="button"
                  className="inline-flex w-fit items-center gap-2 rounded border border-amber-500 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
                  onClick={openTokenInPUF}
                >
                  💰 Comprar {MEMECOIN_CONFIG.symbol} en PUF
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-60"
                onClick={handleJoin}
                disabled={!canJoin}
              >
                {joining ? 'Procesando...' : 'Unirse al torneo'}
              </button>
              <button
                type="button"
                className="rounded-lg border border-blue-600 px-4 py-2 text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
                onClick={() => router.push(`/game?tournamentId=${tournament.tournamentId}`)}
                disabled={!canPlay}
              >
                Jugar
              </button>
            </div>
          </article>

          <article className="rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Leaderboard (Top 10)</h3>
              <Link className="text-blue-600 hover:underline" href="/leaderboard">
                Ver global
              </Link>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Usuario</th>
                    <th className="py-2 pr-2">Puntaje</th>
                    <th className="py-2 pr-2">Premio</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-gray-500">
                        Sin resultados aún.
                      </td>
                    </tr>
                  )}
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.userId}
                      className={entry.isCurrentUser ? 'bg-blue-50 font-semibold' : ''}
                    >
                      <td className="py-2 pr-2">{entry.rank}</td>
                      <td className="py-2 pr-2">{entry.username}</td>
                      <td className="py-2 pr-2">{entry.score}</td>
                      <td className="py-2 pr-2">
                        {entry.prize ? formatToken(entry.prize, tournament.buyInToken) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
