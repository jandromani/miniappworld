"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MiniKit, Tokens, VerificationLevel } from "@worldcoin/minikit-js";

import { questions } from "@/lib/questions";
import { advance, createRuntimeState, evaluateAnswer, Lifeline, RuntimeState, timeout, useLifeline } from "@/lib/gameLogic";
import { GameSession, PlayerStats, Tournament } from "@/lib/types";

const defaultTournament: Tournament = {
  tournamentId: "tournament-phase1",
  buyInToken: "WLD",
  buyInAmount: "1000000000000000000",
  prizePool: "45000000000000000000",
  participants: [],
  startedAt: new Date(),
  endsAt: new Date(Date.now() + 1000 * 60 * 60 * 6),
  status: "open",
};

const seedStats: PlayerStats = {
  userId: "unverified",
  walletAddress: "0x0000...demo",
  username: "Guest",
  totalGamesPlayed: 4,
  totalWins: 2,
  totalLosses: 2,
  highestScore: 5200,
  averageScore: 3100,
  tournamentsWon: 1,
  totalEarnings: "2000000000000000000",
  lastPlayedAt: new Date(),
};

const globalLeaderboard = [
  { name: "0xalice", score: 14500, mode: "tournament" },
  { name: "0xbob", score: 12600, mode: "quick" },
  { name: "0xcarol", score: 12000, mode: "tournament" },
  { name: "0xdave", score: 9800, mode: "practice" },
  { name: "0xeva", score: 9400, mode: "quick" },
];

const deckSize = 15;

function pickDeck() {
  const ordered = [...questions].sort((a, b) => a.difficulty - b.difficulty);
  return ordered.slice(0, deckSize);
}

function toPlainSession(session: GameSession) {
  return {
    ...session,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt ? session.finishedAt.toISOString() : undefined,
  };
}

export default function GamePage() {
  const [stage, setStage] = useState<"lobby" | "buyIn" | "playing" | "summary">("lobby");
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [questionStart, setQuestionStart] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "verified" | "skipped">("pending");
  const [token, setToken] = useState<Tournament["buyInToken"]>("WLD");
  const [tournament] = useState<Tournament>(defaultTournament);
  const [lastSession, setLastSession] = useState<GameSession | null>(null);
  const [notificationSent, setNotificationSent] = useState(false);

  const deck = useMemo(() => pickDeck(), []);

  useEffect(() => {
    const storedUserId = typeof window !== "undefined" ? localStorage.getItem("world-id-user") : null;
    if (storedUserId) {
      setUserId(storedUserId);
      setVerificationStatus("verified");
    }

    const storedSession = typeof window !== "undefined" ? localStorage.getItem("last-session") : null;
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        setLastSession({
          ...parsed,
          startedAt: new Date(parsed.startedAt),
          finishedAt: parsed.finishedAt ? new Date(parsed.finishedAt) : undefined,
        });
      } catch (error) {
        console.error("No se pudo cargar la última sesión", error);
      }
    }
  }, []);

  useEffect(() => {
    const autoVerify = async () => {
      if (verificationStatus !== "pending") return;
      if (!MiniKit.isInstalled?.()) {
        setVerificationStatus("skipped");
        return;
      }
      try {
        const { finalPayload } = await MiniKit.commandsAsync.verify({
          action: "trivia_game_access",
          verification_level: VerificationLevel.Orb,
        });
        if (finalPayload?.nullifier_hash) {
          localStorage.setItem("world-id-user", finalPayload.nullifier_hash);
          setUserId(finalPayload.nullifier_hash);
          setVerificationStatus("verified");
        }
      } catch (error) {
        console.warn("Verify falló o fue cancelado", error);
        setVerificationStatus("skipped");
      }
    };

    autoVerify();
  }, [verificationStatus]);

  useEffect(() => {
    if (!runtime || stage !== "playing") return;
    const current = runtime.session.questions[runtime.session.currentQuestionIndex];
    setTimeLeft(current.maxTime);
    setQuestionStart(Date.now());
    setFeedback(null);
    setSelectedAnswer(null);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [runtime?.session.currentQuestionIndex, stage]);

  useEffect(() => {
    if (!runtime || stage !== "summary") return;
    const didWinTournament =
      runtime.session.mode === "tournament" &&
      runtime.session.status === "completed" &&
      runtime.session.answers.every((answer) => answer.isCorrect);

    if (didWinTournament && !notificationSent) {
      sendTournamentNotification(runtime.session.userId).finally(() => setNotificationSent(true));
    }
  }, [runtime, stage, notificationSent]);

  const startMode = (selectedMode: GameSession["mode"]) => {
    const nextRuntime = createRuntimeState(deck, userId ?? "guest", selectedMode, selectedMode === "tournament" ? tournament.tournamentId : undefined);
    setRuntime(nextRuntime);
    setStage(selectedMode === "tournament" ? "buyIn" : "playing");
  };

  const handleVerify = async () => {
    try {
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: "trivia_game_access",
        verification_level: VerificationLevel.Orb,
      });
      if (finalPayload?.nullifier_hash) {
        localStorage.setItem("world-id-user", finalPayload.nullifier_hash);
        setUserId(finalPayload.nullifier_hash);
        setVerificationStatus("verified");
      }
    } catch (error) {
      console.warn("Verify falló", error);
      setVerificationStatus("skipped");
    }
  };

  const handleBuyIn = async () => {
    if (!runtime) return;
    if (!userId) {
      await handleVerify();
      const refreshedUser = localStorage.getItem("world-id-user");
      if (!refreshedUser) return;
      setUserId(refreshedUser);
    }

    const response = await fetch("/api/initiate-payment", {
      method: "POST",
      body: JSON.stringify({ reference: runtime.session.tournamentId }),
    });
    const payload = await response.json();

    const symbol = token === "USDC" ? (Tokens as any).USDC ?? Tokens.WLD : Tokens.WLD;

    try {
      await MiniKit.commandsAsync.pay({
        reference: payload.reference,
        to: payload.to,
        tokens: [{ symbol, token_amount: payload.amount }],
        description: "Tournament entry",
      });
      setStage("playing");
    } catch (error) {
      console.warn("Pago cancelado o fallido", error);
    }
  };

  const handleAnswer = (index: number) => {
    if (!runtime || stage !== "playing" || feedback) return;
    const timeSpent = questionStart ? Math.max(1, Math.round((Date.now() - questionStart) / 1000)) : 0;
    setSelectedAnswer(index);
    const { runtime: answeredRuntime, correct } = evaluateAnswer(runtime, index, timeSpent);
    setRuntime(answeredRuntime);
    setFeedback(correct ? "¡Correcto!" : "Respuesta incorrecta");

    if (!correct) {
      const failedSession: RuntimeState = {
        ...answeredRuntime,
        session: {
          ...answeredRuntime.session,
          status: "failed",
          finishedAt: new Date(),
        },
      };
      finalizeSession(failedSession);
      return;
    }

    const isLast = answeredRuntime.session.currentQuestionIndex === answeredRuntime.session.questions.length - 1;
    if (isLast) {
      const completed = advance(answeredRuntime, "completed");
      finalizeSession(completed);
      return;
    }

    setTimeout(() => {
      setRuntime(advance(answeredRuntime, "completed"));
      setFeedback(null);
      setSelectedAnswer(null);
    }, 850);
  };

  const handleTimeout = () => {
    if (!runtime || stage !== "playing") return;
    const timeSpent = questionStart ? Math.round((Date.now() - questionStart) / 1000) : 0;
    const failed = timeout(runtime, timeSpent);
    finalizeSession(failed);
  };

  const handleLifeline = (lifeline: Lifeline) => {
    if (!runtime || stage !== "playing") return;
    const updated = useLifeline(runtime, lifeline);
    setRuntime(updated);
  };

  const finalizeSession = (state: RuntimeState) => {
    setRuntime(state);
    setStage("summary");
    if (state.session.mode !== "practice") {
      persistSession(state.session);
    }
  };

  const persistSession = (session: GameSession) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("last-session", JSON.stringify(toPlainSession(session)));
    setLastSession(session);
  };

  const resetGame = () => {
    setRuntime(null);
    setStage("lobby");
    setFeedback(null);
    setSelectedAnswer(null);
    setNotificationSent(false);
  };

  const currentQuestion = runtime?.session.questions[runtime.session.currentQuestionIndex];
  const correctCount = runtime?.session.answers.filter((answer) => answer.isCorrect).length ?? 0;
  const totalTime = runtime?.session.answers.reduce((sum, answer) => sum + answer.timeSpent, 0) ?? 0;

  return (
    <main className="card" style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Mini app de trivia 50x15</h2>
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            Flujo completo de lobby, buy-in, partida y resumen con MiniKit.
          </p>
        </div>
        <Link className="button secondary" href="/leaderboard">
          Ver leaderboard
        </Link>
      </header>

      {stage === "lobby" && (
        <section className="grid">
          <div className="card" style={{ background: "rgba(255,255,255,0.03)", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                className={`pill ${verificationStatus === "verified" ? "success" : "warning"}`}
                aria-live="polite"
              >
                {verificationStatus === "verified" ? "World ID verificado" : "Pendiente de verify"}
              </div>
              <button className="button secondary" onClick={handleVerify}>
                Reintentar verify
              </button>
            </div>
            <h3>Lobby / Home</h3>
            <p style={{ color: "#cbd5e1", margin: 0 }}>
              Elige un modo de juego, mira el leaderboard global y revisa tu perfil antes de entrar.
              Se lanza <code>MiniKit.verify</code> al primer acceso.
            </p>
            <div className="lifeline-row">
              <button className="button" onClick={() => startMode("quick")}>Partida Rápida</button>
              <button className="button" onClick={() => startMode("tournament")}>Torneo (buy-in)</button>
              <button className="button" onClick={() => startMode("practice")}>Práctica</button>
            </div>
            <p style={{ margin: 0, color: "#cbd5e1" }}>
              Última partida guardada localmente en IndexedDB/localStorage.
            </p>
            {lastSession && (
              <div className="badge" style={{ width: "fit-content" }}>
                #{lastSession.sessionId.slice(0, 6)} · {lastSession.mode} · {lastSession.status}
              </div>
            )}
          </div>

          <div className="card" style={{ background: "rgba(255,255,255,0.03)", display: "grid", gap: 8 }}>
            <h3>Leaderboard global (top 5)</h3>
            <table className="table">
              <tbody>
                {globalLeaderboard.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.score} pts</td>
                    <td>
                      <span className="pill neutral">{row.mode}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ background: "rgba(255,255,255,0.03)", display: "grid", gap: 8 }}>
            <h3>Perfil del jugador</h3>
            <p style={{ margin: 0, color: "#cbd5e1" }}>Stats simulados con userId {userId ?? seedStats.userId}</p>
            <div className="grid">
              <div className="badge">Partidas: {seedStats.totalGamesPlayed}</div>
              <div className="badge">Victorias: {seedStats.totalWins}</div>
              <div className="badge">Derrotas: {seedStats.totalLosses}</div>
              <div className="badge">Máximo puntaje: {seedStats.highestScore}</div>
            </div>
          </div>
        </section>
      )}

      {stage === "buyIn" && runtime && (
        <section className="card" style={{ background: "rgba(255,255,255,0.02)", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Buy-in del torneo</h3>
            <div className="badge">Prize pool: {(Number(tournament.prizePool) / 1e18).toFixed(2)} WLD</div>
          </div>
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            Selecciona token y ejecuta <code>MiniKit.pay</code> para entrar. Si no estás verificado, se relanza
            <code>verify</code> automáticamente.
          </p>
          <div className="lifeline-row">
            {(["WLD", "USDC", "MEMECOIN"] as Tournament["buyInToken"][]).map((option) => (
              <button
                key={option}
                className={`button ${token === option ? "" : "secondary"}`}
                onClick={() => setToken(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <button className="button" onClick={handleBuyIn}>
            Pagar y Entrar
          </button>
          <button className="button secondary" onClick={resetGame}>
            Volver al lobby
          </button>
        </section>
      )}

      {stage === "playing" && runtime && currentQuestion && (
        <section className="card" style={{ background: "rgba(255,255,255,0.02)", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="badge">Pregunta {runtime.session.currentQuestionIndex + 1} / {runtime.session.questions.length}</div>
            <div className="badge">{currentQuestion.category}</div>
            <div className="badge">Dificultad {currentQuestion.difficulty}</div>
            <div className="badge">Puntos: {runtime.session.score}</div>
            <div className="badge time">⏱️ {timeLeft}s</div>
          </div>

          <div className="progress">
            <div
              className="progress-bar"
              style={{ width: `${(timeLeft / currentQuestion.maxTime) * 100}%` }}
              aria-valuenow={timeLeft}
            />
          </div>

          <h3 style={{ margin: 0 }}>{currentQuestion.text}</h3>
          <div className="lifeline-row">
            <button className="button secondary" onClick={() => handleLifeline("fiftyFifty")} disabled={!runtime.session.lifelines.fiftyFifty}>
              50/50
            </button>
            <button className="button secondary" onClick={() => handleLifeline("askAudience")} disabled={!runtime.session.lifelines.askAudience}>
              Público
            </button>
            <button className="button secondary" onClick={() => handleLifeline("changeQuestion")} disabled={!runtime.session.lifelines.changeQuestion}>
              Cambiar pregunta
            </button>
          </div>

          <section className="question">
            {currentQuestion.options.map((answer, idx) => {
              const isCorrect = feedback && idx === currentQuestion.correctIndex;
              const eliminated = runtime.eliminatedOptions.includes(idx) && !feedback;
              const classes = [
                "answer",
                isCorrect ? "correct" : "",
                feedback && selectedAnswer === idx && !isCorrect ? "incorrect" : "",
                eliminated ? "eliminated" : "",
              ].join(" ");

              return (
                <button key={answer} className={classes} onClick={() => handleAnswer(idx)} disabled={Boolean(feedback) || eliminated}>
                  {answer}
                  {runtime.audiencePoll && <span style={{ float: "right", color: "#cbd5e1" }}>{runtime.audiencePoll[idx]}%</span>}
                </button>
              );
            })}
          </section>

          {feedback && (
            <div className="pill success" role="status">
              {feedback}
            </div>
          )}

          <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
            <h4 style={{ marginTop: 0 }}>Progreso</h4>
            <div className="grid">
              {runtime.session.questions.map((q, idx) => (
                <div key={q.id} className="badge" style={{ justifyContent: "space-between", opacity: idx <= runtime.session.currentQuestionIndex ? 1 : 0.65 }}>
                  <span>#{idx + 1}</span>
                  <span>{q.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {stage === "summary" && runtime && (
        <section className="card" style={{ background: "rgba(255,255,255,0.02)", display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Resumen de la partida</h3>
          <div className="grid">
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="pill neutral">{runtime.session.mode}</p>
              <h2 style={{ margin: "8px 0" }}>{runtime.session.score} pts</h2>
              <p style={{ margin: 0, color: "#cbd5e1" }}>Puntos totales acumulados</p>
            </div>
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="pill neutral">Correctas / Incorrectas</p>
              <h2 style={{ margin: "8px 0" }}>{correctCount} / {runtime.session.answers.length - correctCount}</h2>
              <p style={{ margin: 0, color: "#cbd5e1" }}>Tiempo total: {totalTime}s</p>
            </div>
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="pill neutral">Leaderboard torneo</p>
              <h2 style={{ margin: "8px 0" }}>#{Math.max(1, Math.ceil(Math.random() * 10))}</h2>
              <p style={{ margin: 0, color: "#cbd5e1" }}>Posición estimada en pool</p>
            </div>
          </div>

          <div className="lifeline-row">
            <button className="button" onClick={() => startMode(runtime.session.mode)}>Jugar de nuevo</button>
            <button className="button secondary" onClick={resetGame}>Volver al lobby</button>
            <Link className="button secondary" href="/leaderboard">Ver leaderboard</Link>
          </div>
        </section>
      )}
    </main>
  );
}

async function sendTournamentNotification(userId: string) {
  await fetch("/api/send-notification", {
    method: "POST",
    body: JSON.stringify({
      userId,
      message: "🎉 You won the tournament! Prize: 100 WLD",
    }),
  });
}
