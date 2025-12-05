'use client';

import { useEffect, useState } from 'react';

const POLICY_VERSION = '2024-10';

export default function PrivacyPage() {
  const [policy, setPolicy] = useState<{ retentionDays: number; sensitiveFields: string[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const response = await fetch('/api/player/privacy', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? 'No se pudo cargar la política');
        }
        setPolicy(data.policy);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al obtener política de privacidad');
      }
    };

    void fetchPolicy();
  }, []);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6" aria-labelledby="privacy-title">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-blue-700">Privacidad y cumplimiento</p>
        <h1 id="privacy-title" className="text-3xl font-bold">
          Política de privacidad y consentimiento informado
        </h1>
        <p className="text-gray-600">
          Explicamos qué datos sensibles procesamos (wallet y user_id), por qué los retenemos y cómo ejercer tus
          derechos de acceso, exportación y borrado.
        </p>
      </header>

      <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Resumen de política">
        <h2 className="text-xl font-semibold">Resumen rápido</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-gray-700">
          <li>
            Versión de política: <strong>{POLICY_VERSION}</strong>. Campos sensibles cubiertos: wallet_address y user_id.
          </li>
          <li>
            Retención máxima comunicada: <strong>{policy?.retentionDays ?? 30} días</strong> (puedes pedir menor
            retención desde tu perfil).
          </li>
          <li>Finalidad: verificación antifraude, cumplimiento de pagos y seguridad de torneos.</li>
        </ul>
        {error && (
          <p className="mt-3 text-sm text-amber-700" role="status" aria-live="polite">
            {error}
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Cómo dar consentimiento">
        <h2 className="text-xl font-semibold">Cómo otorgar o revocar consentimiento</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-gray-700">
          <li>Inicia sesión con World ID para que podamos asociar tu consentimiento a tu user_id.</li>
          <li>
            En <strong>Perfil y privacidad</strong> activa o desactiva el procesamiento de wallet y user_id y define la
            retención (hasta 30 días).
          </li>
          <li>Guarda los cambios; registramos auditoría del consentimiento y la versión de la política.</li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Derechos de datos">
        <h2 className="text-xl font-semibold">Ejercer tus derechos</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-gray-50 p-4">
            <h3 className="text-lg font-semibold">Exportar datos</h3>
            <p className="text-sm text-gray-700">
              Desde tu perfil pulsa “Exportar datos en JSON” para descargar información de perfil, pagos, torneos y
              consents asociada a tu user_id y wallet.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border bg-gray-50 p-4">
            <h3 className="text-lg font-semibold">Solicitar borrado</h3>
            <p className="text-sm text-gray-700">
              Usa “Borrar todos mis datos” para eliminar registros locales (wallet, user_id, progreso, consents). El
              borrado se registra en el log de auditoría.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Accesibilidad">
        <h2 className="text-xl font-semibold">Accesibilidad (WCAG)</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-gray-700">
          <li>Roles ARIA en banners de estado y formularios de consentimiento.</li>
          <li>Navegación por teclado con focos visibles en botones de verificación, exportación y borrado.</li>
          <li>Contrastes reforzados en acciones principales y enlaces de política.</li>
        </ul>
      </section>
    </main>
  );
}
