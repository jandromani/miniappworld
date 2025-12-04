import Link from "next/link";

const tabs = [
  { href: "/game", label: "Modo rápido" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "https://developer.worldcoin.org/", label: "Portal" },
  { href: "https://docs.worldcoin.org/", label: "Docs" },
];

export default function HomePage() {
  return (
    <main>
      <section className="card" style={{ marginBottom: 24 }}>
        <div className="tab-bar">
          {tabs.map((tab) => (
            <Link key={tab.label} href={tab.href} className="tab" prefetch={false}>
              {tab.label}
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <p style={{ color: "#cbd5e1", margin: 0 }}>
            Construye y prueba la mini app de trivia “50x15” con flujos de
            autenticación, verificación, pagos y torneos.
          </p>
          <div className="grid">
            <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
              <h3>Fases del proyecto</h3>
              <ul style={{ color: "#cbd5e1", lineHeight: 1.5 }}>
                <li>Fase 2: boilerplate MiniKit en Next + TypeScript.</li>
                <li>Fase 3: mecánica de trivia, timer y comodines.</li>
                <li>Fase 4: pagos World Chain y pool de premios.</li>
                <li>Fase 5: leaderboard, notificaciones y growth.</li>
              </ul>
            </div>
            <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
              <h3>Config rápida</h3>
              <ol style={{ color: "#cbd5e1", lineHeight: 1.5 }}>
                <li>Define <code>NEXT_PUBLIC_APP_ID</code> y <code>NEXT_PUBLIC_DEV_PORTAL_API_KEY</code>.</li>
                <li>Autentica con Wallet Auth y verifica World ID si aplica.</li>
                <li>Prueba el modo rápido y envía pagos a contratos.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
