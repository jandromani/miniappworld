'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tournament } from '@/lib/types';
import { getActiveTournaments } from '@/lib/tournamentService';
import { getTokenDecimalsByAddress, getTokenSymbolByAddress } from '@/lib/constants';
import { SessionVerificationBar } from '@/components/SessionVerificationBar';

const statusLabels: Record<Tournament['status'], string> = {
  upcoming: 'Próximo',
  active: 'En curso',
  finished: 'Finalizado',
};

function formatTokenAmount(amount: string, tokenAddress: string) {
  const decimals = getTokenDecimalsByAddress(tokenAddress);
  const value = Number(amount) / 10 ** decimals;
  return value >= 0.01 ? value.toFixed(2) : amount;
}

export default function TournamentPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getActiveTournaments();
        setTournaments(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudieron cargar los torneos';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <main className="p-6 flex flex-col gap-6">
      <header className="space-y-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Torneos</h1>
          <p className="text-gray-600">Compra tu buy-in, compite en 15 preguntas y escala al leaderboard.</p>
        </div>

        <SessionVerificationBar sessionId={sessionId} context="tournament" />
      </header>

      {loading && (
        <p role="status" aria-live="polite">
          Cargando torneos...
        </p>
      )}
      {error && (
        <p className="text-red-600" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {!loading && !error && tournaments.length === 0 && (
        <p className="text-gray-500">No hay torneos disponibles por ahora.</p>
      )}

      <section className="grid gap-4 md:grid-cols-2" aria-label="Lista de torneos">
        {tournaments.map((tournament) => (
          <article
            key={tournament.tournamentId}
            className="rounded-xl border p-4 shadow-sm transition focus-within:ring-2 focus-within:ring-blue-500"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">{tournament.name}</h2>
                <p className="text-sm text-gray-500">{statusLabels[tournament.status]}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Buy-in: {formatTokenAmount(tournament.buyInAmount, tournament.buyInToken)}{' '}
                {getTokenSymbolByAddress(tournament.buyInToken)}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-gray-500">Prize pool</dt>
                <dd className="font-semibold">
                  {formatTokenAmount(tournament.prizePool, tournament.buyInToken)}{' '}
                  {getTokenSymbolByAddress(tournament.buyInToken)}
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
            </dl>

            <div className="mt-4 flex justify-end">
              <Link
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
                href={`/tournament/${tournament.tournamentId}`}
              >
                Ver detalles
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
