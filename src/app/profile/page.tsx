'use client';

import { useHapticsPreference } from '@/lib/useHapticsPreference';

export default function ProfilePage() {
  const { hapticsEnabled, setHapticsEnabled } = useHapticsPreference();

  return (
    <main className="p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Perfil del usuario</h1>
      <p>Próximamente: datos de usuario, progreso y configuración.</p>

      <section className="rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Preferencias</h2>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="font-medium">Feedback háptico</p>
            <p className="text-sm text-gray-600">
              Vibra al responder preguntas dentro del juego.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <span className="text-gray-700">{hapticsEnabled ? 'Activado' : 'Desactivado'}</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-blue-600"
              checked={hapticsEnabled}
              onChange={(event) => setHapticsEnabled(event.target.checked)}
            />
          </label>
        </div>
      </section>
    </main>
  );
}
