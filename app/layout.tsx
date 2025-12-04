import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Trivia 50x15 | Mini App",
  description: "Juego de trivia con integración MiniKit y World Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <div className="container">
            <header style={{ padding: "20px 0" }}>
              <h1 style={{ margin: 0, fontSize: "28px" }}>Trivia 50x15</h1>
              <p style={{ margin: 0, color: "#cbd5e1" }}>
                Mini App con flujos de juego, pagos, torneos y leaderboard.
              </p>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
