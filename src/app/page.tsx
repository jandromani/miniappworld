'use client';

import { useEffect, useState } from 'react';
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js';
import { useRouter } from 'next/navigation';
import { DEFAULT_WORLD_ID_ACTION, isValidWorldIdAction } from '@/lib/worldId';

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const worldIdAction = isValidWorldIdAction(DEFAULT_WORLD_ID_ACTION)
    ? DEFAULT_WORLD_ID_ACTION
    : 'trivia_game_access';

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
        action: worldIdAction,
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
            action: worldIdAction,
            verification_level: finalPayload.verification_level,
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
    return <div className="flex items-center justify-center h-screen">Verificando identidad...</div>;
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-2xl font-bold">Trivia 50x15</h1>
        <button
          onClick={verifyUser}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg"
        >
          Verificar con World ID
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
      <h1 className="text-3xl font-bold">Trivia 50x15</h1>
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          hasSession ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
        }`}
      >
        <span className="text-lg">{hasSession ? '✅' : '⚠️'}</span>
        <span>
          {hasSession
            ? 'Sesión verificada con World ID'
            : 'Sesión no verificada. Por favor, realiza Verify.'}
        </span>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-md">
        <button
          onClick={() => router.push('/game')}
          className="px-6 py-4 bg-green-600 text-white rounded-lg text-lg font-semibold"
        >
          🎮 Partida Rápida
        </button>
        <button
          onClick={() => router.push('/tournament')}
          className="px-6 py-4 bg-purple-600 text-white rounded-lg text-lg font-semibold"
        >
          🏆 Torneos
        </button>
        <button
          onClick={() => router.push('/leaderboard')}
          className="px-6 py-4 bg-yellow-600 text-white rounded-lg text-lg font-semibold"
        >
          📊 Leaderboard
        </button>
        <button
          onClick={() => router.push('/profile')}
          className="px-6 py-4 bg-gray-600 text-white rounded-lg text-lg font-semibold"
        >
          👤 Perfil
        </button>
        {!hasSession && (
          <button
            onClick={verifyUser}
            className="px-6 py-4 bg-blue-600 text-white rounded-lg text-lg font-semibold"
          >
            🔒 Verify con World ID
          </button>
        )}
      </div>
    </div>
  );
}
