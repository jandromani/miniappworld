'use client';

import { useEffect, useRef, useState } from 'react';
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js';

type PlayerStats = {
  userId: string;
  walletAddress: string;
  username: string;
  alias?: string;
  avatarUrl?: string;
  totalGamesPlayed: number;
  totalWins: number;
  totalLosses: number;
  highestScore: number;
  averageScore: number;
  tournamentsWon: number;
  totalEarnings: string;
  lastPlayedAt: string;
};

export default function ProfilePage() {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alias, setAlias] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/player/stats', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401) {
          setError('Necesitas verificar tu identidad para ver tu perfil.');
          return;
        }

        const data = await response.json();
        const message = data?.error ?? 'No se pudieron cargar las estadísticas';
        throw new Error(message);
      }

      const data = (await response.json()) as PlayerStats;
      setStats(data);
      setAlias(data.alias ?? data.username ?? '');
      setAvatarUrl(data.avatarUrl ?? '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al cargar perfil';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const verifyUser = async () => {
    if (!MiniKit.isInstalled()) {
      setError('MiniKit no está instalado. Abre esta mini app desde World App.');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: 'trivia_profile_access',
        verification_level: VerificationLevel.Orb,
      });

      if (finalPayload.status === 'error') {
        throw new Error(`Error en Verify: ${finalPayload.error_code}`);
      }

      const res = await fetch('/api/verify-world-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          proof: finalPayload.proof,
          nullifier_hash: finalPayload.nullifier_hash,
          merkle_root: finalPayload.merkle_root,
          action: 'trivia_profile_access',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        const message = data?.error ?? 'No se pudo verificar la identidad';
        throw new Error(message);
      }

      localStorage.setItem('userId', data.userId);
      await loadStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al verificar identidad';
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload: { alias?: string; avatarUrl?: string } = {};
      if (alias.trim()) payload.alias = alias.trim();
      if (avatarUrl.trim()) payload.avatarUrl = avatarUrl.trim();

      const response = await fetch('/api/player/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data?.error ?? 'No se pudo actualizar el perfil';
        throw new Error(message);
      }

      setStats(data as PlayerStats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al guardar';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="p-6 flex flex-col gap-6 max-w-4xl mx-auto">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Perfil del jugador</h1>
        <p className="text-gray-600">Consulta tu progreso y personaliza cómo te ven otros jugadores.</p>
      </header>

      {error && (
        <p
          className="text-red-600"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      )}

      {loading && <p className="text-gray-600">Cargando perfil...</p>}

      {!loading && !stats && (
        <div className="rounded-lg border p-4 bg-gray-50">
          <p className="mb-3">No pudimos mostrar tu perfil sin verificar tu identidad.</p>
          <button
            onClick={verifyUser}
            disabled={verifying}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-70"
            aria-busy={verifying}
          >
            {verifying ? 'Verificando...' : 'Verificar con World ID'}
          </button>
        </div>
      )}

      {stats && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-lg border p-5 shadow-sm bg-white">
            <div className="flex items-center gap-4 mb-4">
              {stats.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stats.avatarUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full border object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-gray-200" />
              )}
              <div>
                <h2 className="text-xl font-semibold">{stats.alias || stats.username}</h2>
                <p className="text-gray-500 text-sm">ID: {stats.userId}</p>
                <p className="text-gray-500 text-sm">Wallet: {stats.walletAddress}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Partidas jugadas" value={stats.totalGamesPlayed} />
              <StatCard label="Victorias" value={stats.totalWins} />
              <StatCard label="Derrotas" value={stats.totalLosses} />
              <StatCard label="Mejor puntaje" value={stats.highestScore} />
              <StatCard label="Promedio" value={stats.averageScore.toFixed(2)} />
              <StatCard label="Torneos ganados" value={stats.tournamentsWon} />
              <StatCard label="Ganancias" value={`${stats.totalEarnings} WLD/USDC`} />
              <StatCard
                label="Última actividad"
                value={new Date(stats.lastPlayedAt).toLocaleString()}
              />
            </div>
          </section>

          <section className="rounded-lg border p-5 shadow-sm bg-white space-y-4">
            <h3 className="text-lg font-semibold">Personaliza tu perfil</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="player-alias">
                Alias
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                placeholder="Ingresa tu alias"
                maxLength={32}
                id="player-alias"
              />
              <p className="text-xs text-gray-500">Entre 3 y 32 caracteres.</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="player-avatar">
                Avatar (URL)
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                placeholder="https://..."
                id="player-avatar"
              />
              <p className="text-xs text-gray-500">Usa una URL pública a tu imagen.</p>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-70"
              aria-busy={saving}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              onClick={verifyUser}
              disabled={verifying}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-70"
              aria-busy={verifying}
            >
              {verifying ? 'Verificando...' : 'Reverificar World ID'}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4 bg-gray-50">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
