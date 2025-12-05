'use client';

import { useEffect, useState } from 'react';
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const getSessionFromCookies = () => {
    if (typeof document === 'undefined') return null;
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('session_token='));
    return cookie?.split('=')[1] ?? null;
  };

  const updateSessionState = () => {
    setHasSession(Boolean(getSessionFromCookies()));
  };

  useEffect(() => {
    // Verificar World ID al cargar la app (solo una vez)
    const storedUserId = localStorage.getItem('userId');
    updateSessionState();
    if (!storedUserId && MiniKit.isInstalled()) {
      verifyUser();
    } else {
      setUserId(storedUserId);
    }
  }, []);

  const verifyUser = async () => {
    setIsVerifying(true);
    try {
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: 'trivia_game_access',
        verification_level: VerificationLevel.Orb,
      });

      if (finalPayload.status === 'success') {
        // Enviar proof al backend para verificar
        const res = await fetch('/api/verify-world-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            proof: finalPayload.proof,
            nullifier_hash: finalPayload.nullifier_hash,
            merkle_root: finalPayload.merkle_root,
          }),
        });

        const data = await res.json();

        if (res.ok && data?.success) {
          localStorage.setItem('userId', data.userId);
          setUserId(data.userId);
          updateSessionState();
        } else {
          const message = data?.error ?? 'Error al verificar World ID';
          alert(message);
        }
      }
    } catch (error) {
      console.error('Error en Verify:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="flex items-center justify-center h-screen" role="status" aria-live="polite">
        Verificando identidad...
      </div>
    );
  }

  if (!userId) {
    return (
      <main className="flex flex-col items-center justify-center h-screen gap-4 p-6" aria-labelledby="app-title">
        <h1 id="app-title" className="text-2xl font-bold text-white">
          Trivia 50x15
        </h1>
        <p className="max-w-xl text-center text-slate-200" aria-live="polite">
          Necesitamos tu consentimiento para procesar tu identificador de usuario y wallet con fines de verificación.
          Consulta la política antes de continuar.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-sm" role="group" aria-label="Acciones iniciales">
          <a
            className="rounded-lg border border-white/40 px-4 py-3 text-center text-white transition hover:bg-white/10"
            href="/privacy"
          >
            Revisar política y consentimiento
          </a>
          <button
            type="button"
            onClick={verifyUser}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white/70"
            aria-describedby="consent-reminder"
          >
            Verificar con World ID
          </button>
          <p id="consent-reminder" className="text-sm text-slate-200 text-center">
            Al verificar aceptas el uso de tu wallet y user_id para control antifraude durante 30 días.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex flex-col items-center justify-center h-screen gap-4 p-4"
      aria-labelledby="app-heading"
    >
      <h1 id="app-heading" className="text-3xl font-bold text-white">
        Trivia 50x15
      </h1>
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          hasSession ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="text-lg" aria-hidden>
          {hasSession ? '✅' : '⚠️'}
        </span>
        <span>
          {hasSession
            ? 'Sesión verificada con World ID'
            : 'Sesión no verificada. Por favor, realiza Verify.'}
        </span>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-md" role="navigation" aria-label="Navegación principal">
        <button
          type="button"
          onClick={() => router.push('/game')}
          className="px-6 py-4 bg-green-600 text-white rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          🎮 Partida Rápida
        </button>
        <button
          type="button"
          onClick={() => router.push('/tournament')}
          className="px-6 py-4 bg-purple-700 text-white rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          🏆 Torneos
        </button>
        <button
          type="button"
          onClick={() => router.push('/leaderboard')}
          className="px-6 py-4 bg-yellow-700 text-white rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
        >
          📊 Leaderboard
        </button>
        <button
          type="button"
          onClick={() => router.push('/profile')}
          className="px-6 py-4 bg-gray-800 text-white rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200"
        >
          👤 Perfil y privacidad
        </button>
        {!hasSession && (
          <button
            type="button"
            onClick={verifyUser}
            className="px-6 py-4 bg-blue-600 text-white rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            🔒 Verify con World ID
          </button>
        )}
      </div>
      <section className="rounded-lg border border-white/30 bg-white/10 p-4 text-white shadow-sm max-w-md" aria-label="Privacidad">
        <p className="font-semibold">Privacidad y consentimiento</p>
        <p className="text-sm text-slate-200">
          Gestiona el uso de tu wallet y user_id para prevención de fraude y retención de 30 días en la sección
          "Perfil y privacidad".
        </p>
        <a className="mt-2 inline-block text-sm underline" href="/privacy">
          Ver detalles de la política de privacidad
        </a>
      </section>
    </main>
  );
}
