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
    <main className="p-6 flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Sistema de Buy-In</h1>
        <p className="text-gray-600">
          Elige tu modalidad y paga la entrada con MiniKit para desbloquear partidas rápidas o inscribirte en
          torneos.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          className={`rounded-lg border p-4 text-left transition ${
            mode === 'quick' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
          }`}
          onClick={() => setMode('quick')}
          disabled={isPaying}
        >
          <h2 className="text-xl font-semibold">Partida rápida</h2>
          <p className="text-gray-600">Precio fijo de 1 WLD. Juega al instante.</p>
        </button>

        <button
          type="button"
          className={`rounded-lg border p-4 text-left transition ${
            mode === 'tournament' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
          }`}
          onClick={() => setMode('tournament')}
          disabled={isPaying}
        >
          <h2 className="text-xl font-semibold">Torneo</h2>
          <p className="text-gray-600">Configura token y monto para el buy-in.</p>
        </button>
      </section>

      {mode === 'tournament' && (
        <section className="space-y-4 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Token</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SUPPORTED_TOKENS).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded border px-3 py-2 text-sm transition ${
                    selectedToken === key ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setSelectedToken(key as SupportedToken)}
                  disabled={isPaying}
                >
                  {config.symbol} — {config.name}
                </button>
              ))}
            </div>

            {selectedToken === 'MEMECOIN' && (
              <button
                type="button"
                className="inline-flex w-fit items-center gap-2 rounded border border-amber-500 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
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
              className="rounded border px-3 py-2"
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
        className="rounded-lg bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {isPaying ? 'Procesando...' : mode === 'quick' ? 'Pagar y Jugar (1 WLD)' : 'Pagar e Inscribirse'}
      </button>
    </main>
  );
}
