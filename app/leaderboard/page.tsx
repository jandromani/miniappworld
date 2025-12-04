import Link from "next/link";

const leaderboard = [
  { player: "0xalice", score: 14, prize: 120000 },
  { player: "0xbob", score: 13, prize: 85000 },
  { player: "0xcarol", score: 12, prize: 50000 },
  { player: "0xdave", score: 11, prize: 25000 },
];

export default function LeaderboardPage() {
  return (
    <main className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Leaderboard y torneos</h3>
        <Link className="button secondary" href="/game">
          Volver al juego
        </Link>
      </div>
      <p style={{ color: "#cbd5e1", marginTop: 0 }}>
        Usa este tablero para mostrar ganadores de torneos y jugadores con mayor progreso.
        Conecta con el endpoint <code>/api/send-notification</code> para avisar a los ganadores.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Puntaje</th>
            <th>Premio</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row) => (
            <tr key={row.player}>
              <td>{row.player}</td>
              <td>{row.score}/15</td>
              <td>${row.prize.toLocaleString()} WLD</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
