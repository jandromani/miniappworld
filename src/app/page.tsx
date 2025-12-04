'use client';

import { useEffect, useState } from 'react';
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    // Verificar World ID al cargar la app (solo una vez)
    const storedUserId = localStorage.getItem('userId');
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
          body: JSON.stringify({
            proof: finalPayload.proof,
            nullifier_hash: finalPayload.nullifier_hash,
            merkle_root: finalPayload.merkle_root,
          }),
        });

        if (res.ok) {
          localStorage.setItem('userId', finalPayload.nullifier_hash);
          setUserId(finalPayload.nullifier_hash);
        } else {
          alert('Error al verificar World ID');
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
      </div>
    </div>
  );
}
