'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MEMECOIN_CONFIG, SUPPORTED_TOKENS, SupportedToken } from '@/lib/constants';
import { payForQuickMatch, payForTournament } from '@/lib/paymentService';

const BUY_IN_DEMO_TOURNAMENT = 'demo-tournament';

function openTokenInPUF() {
  window.location.href = MEMECOIN_CONFIG.pufUrl;
}

export default function TournamentBuyInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'quick' | 'tournament'>('quick');
  const [selectedToken, setSelectedToken] = useState<SupportedToken>('WLD');
  const [amount, setAmount] = useState(5);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setError(null);
    setIsPaying(true);

    try {
      if (mode === 'quick') {
        await payForQuickMatch();
        router.push('/game');
        return;
      }

      if (amount <= 0) {
        throw new Error('El monto debe ser mayor a 0');
      }

      await payForTournament(selectedToken, amount, BUY_IN_DEMO_TOURNAMENT);
      router.push('/tournament/registro');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al procesar el pago';
      setError(message);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-purple-700">Pagos MiniKit</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Sistema de Buy-In</h1>
        <p className="text-sm text-gray-600">
          Elige tu modalidad y paga la entrada para desbloquear partidas rápidas o inscribirte en torneos. Diseño listo
          para móviles.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          className={`rounded-lg border p-4 text-left transition ${
            mode === 'quick'
              ? 'border-blue-600 bg-blue-50 shadow-sm'
              : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
          }`}
          onClick={() => setMode('quick')}
          disabled={isPaying}
        >
          <h2 className="text-xl font-semibold">Partida rápida</h2>
          <p className="text-gray-600">Precio fijo de 1 WLD. Juega al instante.</p>
          <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700">
            Optimizado para móviles
          </p>
        </button>

        <button
          type="button"
          className={`rounded-lg border p-4 text-left transition ${
            mode === 'tournament'
              ? 'border-blue-600 bg-blue-50 shadow-sm'
              : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
          }`}
          onClick={() => setMode('tournament')}
          disabled={isPaying}
        >
          <h2 className="text-xl font-semibold">Torneo</h2>
          <p className="text-gray-600">Configura token y monto para el buy-in.</p>
          <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700">
            Flujos accesibles en pantallas pequeñas
          </p>
        </button>
      </section>

      {mode === 'tournament' && (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Token</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="token-grid">
              {Object.entries(SUPPORTED_TOKENS).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded border px-3 py-2 text-left text-sm transition ${
                    selectedToken === key
                      ? 'border-blue-600 bg-blue-50 shadow-sm'
                      : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                  onClick={() => setSelectedToken(key as SupportedToken)}
                  disabled={isPaying}
                >
                  <span className="block font-semibold">{config.symbol}</span>
                  <span className="text-gray-600">{config.name}</span>
                </button>
              ))}
            </div>

            {selectedToken === 'MEMECOIN' && (
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded border border-amber-500 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 sm:w-fit"
                onClick={openTokenInPUF}
              >
                💰 Comprar {MEMECOIN_CONFIG.symbol} en PUF
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Monto del buy-in</label>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              min={0}
              step={0.1}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value))}
              disabled={isPaying}
            />
            <p className="text-sm text-gray-500">Define la entrada en el token seleccionado.</p>
          </div>
        </section>
      )}

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

      <button
        type="button"
        onClick={handlePayment}
        disabled={isPaying}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
      >
        {isPaying ? 'Procesando...' : mode === 'quick' ? 'Pagar y Jugar (1 WLD)' : 'Pagar e Inscribirse'}
      </button>
    </main>
  );
}
