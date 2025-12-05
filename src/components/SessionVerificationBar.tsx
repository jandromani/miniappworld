'use client';

import { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

type SessionStatus = 'checking' | 'verified' | 'attention';

type SessionVerificationBarProps = {
  sessionId?: string;
  context?: 'game' | 'tournament';
};

const STATUS_CONFIG: Record<SessionStatus, { label: string; tone: string; detail: string }> = {
  checking: {
    label: 'Verificando sesión...',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
    detail: 'Comprobando conexión con MiniKit y estado en línea.',
  },
  verified: {
    label: 'Sesión verificada',
    tone: 'bg-green-50 text-green-800 ring-green-200',
    detail: 'Conectado a MiniKit y listo para sincronizar acciones.',
  },
  attention: {
    label: 'Atención a la sesión',
    tone: 'bg-red-50 text-red-800 ring-red-200',
    detail: 'No pudimos confirmar MiniKit o la conexión. Revisa tu app.',
  },
};

export function SessionVerificationBar({ sessionId, context }: SessionVerificationBarProps) {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [statusMessage, setStatusMessage] = useState(STATUS_CONFIG.checking.detail);

  useEffect(() => {
    const evaluateStatus = () => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      const installed = MiniKit.isInstalled?.() ?? false;

      if (installed && online) {
        setStatus('verified');
        setStatusMessage('Sesión conectada y lista para guardar progreso.');
        return;
      }

      if (!online) {
        setStatus('attention');
        setStatusMessage('Estás sin conexión. Reintentaremos sincronizar cuando vuelvas.');
        return;
      }

      setStatus('attention');
      setStatusMessage('Abre la app en World App para validar tu sesión.');
    };

    evaluateStatus();
    window.addEventListener('online', evaluateStatus);
    window.addEventListener('offline', evaluateStatus);

    return () => {
      window.removeEventListener('online', evaluateStatus);
      window.removeEventListener('offline', evaluateStatus);
    };
  }, []);

  const tone = STATUS_CONFIG[status];

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg px-4 py-3 ring-1 sm:flex-row sm:items-center sm:justify-between ${tone.tone}`}
      role="status"
      aria-live="polite"
      data-testid="session-status"
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            status === 'verified' ? 'bg-green-500' : status === 'checking' ? 'bg-amber-500' : 'bg-red-500'
          }`}
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold">{tone.label}</p>
          <p className="text-xs sm:text-sm">{statusMessage}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        {context && (
          <span className="rounded-full bg-white/70 px-3 py-1 font-medium text-gray-800 ring-1 ring-inset ring-white/60">
            Contexto: {context === 'game' ? 'Juego en vivo' : 'Lobby de torneo'}
          </span>
        )}
        {sessionId && (
          <span
            className="rounded-full bg-white/70 px-3 py-1 font-mono text-gray-700 ring-1 ring-inset ring-white/60"
            data-testid="session-id"
          >
            ID: {sessionId}
          </span>
        )}
      </div>
    </div>
  );
}
