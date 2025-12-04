"use client";

import { useEffect, useMemo, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { questions } from "@/lib/questions";
import { evaluateAnswer, initialState, nextQuestion, useLifeline } from "@/lib/gameLogic";

export default function GamePage() {
  const deck = useMemo(() => questions, []);
  const [state, setState] = useState(() => initialState(deck));
  const [timeLeft, setTimeLeft] = useState(30);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  useEffect(() => {
    setTimeLeft(30);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStatus("Tiempo agotado");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.currentIndex]);

  const handleAnswer = (idx: number) => {
    if (status) return;
    setSelectedAnswer(idx);
    const { correct, prize } = evaluateAnswer(state, idx);
    const updatedState = { ...state, prizeTotal: prize };
    setState(updatedState);
    setStatus(correct ? "¡Correcto!" : "Incorrecto");

    setTimeout(() => {
      if (correct && updatedState.currentIndex < deck.length - 1) {
        setState(nextQuestion(deck, updatedState));
        setStatus(null);
        setSelectedAnswer(null);
      }
    }, 900);
  };

  const handleLifeline = (type: Parameters<typeof useLifeline>[1]) => {
    const nextState = useLifeline(state, type);
    setState(nextState);
    if (type === "skip" && state.currentIndex < deck.length - 1) {
      setState(nextQuestion(deck, nextState));
      setStatus(null);
    }
  };

  const startVerification = async () => {
    const appId = process.env.NEXT_PUBLIC_APP_ID ?? "";
    if (!appId) return;
    await MiniKit.commandsAsync.verify({ app_id: appId, action: "start-game" });
  };

  const isEliminated = (index: number) => state.eliminatedOptions.includes(index);

  return (
    <main className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div className="badge">Pregunta {state.currentIndex + 1} / {deck.length}</div>
        <div className="badge">${state.prizeTotal.toLocaleString()} WLD</div>
        <div className="badge">⏱️ {timeLeft}s</div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="button secondary" onClick={startVerification}>
          Verificar World ID
        </button>
        <button className="button secondary" onClick={() => handleLifeline("fiftyFifty")} disabled={state.lifelines.fiftyFifty}>
          50 / 50
        </button>
        <button className="button secondary" onClick={() => handleLifeline("skip")} disabled={state.lifelines.skip}>
          Saltar
        </button>
        <button className="button secondary" onClick={() => handleLifeline("askAudience")} disabled={state.lifelines.askAudience}>
          Preguntar al público
        </button>
      </div>

      <section style={{ marginTop: 16 }} className="question">
        <h3 style={{ margin: 0 }}>{state.currentQuestion.prompt}</h3>
        {state.currentQuestion.answers.map((answer, idx) => {
          const isCorrect = status && idx === state.currentQuestion.correctIndex;
          const eliminated = isEliminated(idx) && state.lifelines.fiftyFifty;
          const classes = [
            "answer",
            isCorrect ? "correct" : "",
            status && selectedAnswer === idx && !isCorrect ? "incorrect" : "",
            eliminated ? "eliminated" : "",
          ].join(" ");
          return (
            <button
              key={answer}
              className={classes}
              onClick={() => handleAnswer(idx)}
              disabled={Boolean(status) || eliminated}
            >
              {answer}
            </button>
          );
        })}
      </section>

      <section style={{ marginTop: 16 }} className="card">
        <h4 style={{ marginTop: 0 }}>Progresión de premios</h4>
        <div className="grid">
          {deck.map((q) => (
            <div key={q.id} className="badge" style={{ justifyContent: "space-between" }}>
              <span>#{q.id}</span>
              <strong>${q.prize.toLocaleString()}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
