'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [amountError, setAmountError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handlePayment = async () => {
    setError(null);
    setAmountError(null);
    setIsPaying(true);

    try {
      if (mode === 'quick') {
        await payForQuickMatch();
        router.push('/game');
        return;
      }

      if (amount <= 0 || Number.isNaN(amount)) {
        const validationMessage = 'El monto debe ser mayor a 0';
        setAmountError(validationMessage);
        amountInputRef.current?.focus();
        throw new Error(validationMessage);
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
          aria-pressed={mode === 'quick'}
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
          aria-pressed={mode === 'tournament'}
        >
          <h2 className="text-xl font-semibold">Torneo</h2>
          <p className="text-gray-600">Configura token y monto para el buy-in.</p>
        </button>
      </section>

      {mode === 'tournament' && (
        <section className="space-y-4 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" id="token-label">
              Token
            </label>
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
                  aria-pressed={selectedToken === key}
                  aria-labelledby={`token-label token-${key}`}
                  id={`token-${key}`}
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
            <label className="text-sm font-medium" htmlFor="buy-in-amount">
              Monto del buy-in
            </label>
            <input
              type="number"
              className="rounded border px-3 py-2"
              min={0}
              step={0.1}
              value={amount}
              onChange={(e) => {
                const nextAmount = parseFloat(e.target.value);
                setAmount(nextAmount);
                if (nextAmount > 0) {
                  setAmountError(null);
                }
              }}
              disabled={isPaying}
              aria-describedby={`buy-in-help${amountError ? ' buy-in-error' : ''}`}
              aria-invalid={Boolean(amountError)}
              id="buy-in-amount"
              ref={amountInputRef}
            />
            <p className="text-sm text-gray-500" id="buy-in-help">
              Define la entrada en el token seleccionado.
            </p>
            {amountError && (
              <p
                className="text-sm text-red-600"
                id="buy-in-error"
                role="alert"
                aria-live="assertive"
              >
                {amountError}
              </p>
            )}
          </div>
        </section>
      )}

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handlePayment}
        disabled={isPaying}
        className="rounded-lg bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-700 disabled:opacity-60"
        aria-busy={isPaying}
      >
        {isPaying ? 'Procesando...' : mode === 'quick' ? 'Pagar y Jugar (1 WLD)' : 'Pagar e Inscribirse'}
      </button>
    </main>
  );
}
