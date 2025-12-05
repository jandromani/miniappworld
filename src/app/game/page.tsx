'use client';

import { useMemo, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

type MockQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
};

const sampleQuestions: MockQuestion[] = [
  {
    id: 'q1',
    text: '¿Cuál es la capital de Francia?',
    options: ['Madrid', 'París', 'Roma', 'Lisboa'],
    correctIndex: 1,
  },
];

export default function GamePage() {
  const [question] = useState<MockQuestion>(sampleQuestions[0]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalAnswers, setTotalAnswers] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const persistProgress = async (nextScore: number, nextCorrect: number, nextTotal: number) => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/game/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          mode: 'quick',
          score: nextScore,
          correctAnswers: nextCorrect,
          totalQuestions: nextTotal,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? 'No se pudo guardar el progreso');
      }

      setLastSavedAt(new Date().toLocaleTimeString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado al guardar progreso';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAnswerSelection = (selectedIndex: number) => {
    const isCorrect = selectedIndex === question.correctIndex;
    const nextTotal = totalAnswers + 1;
    const nextCorrect = isCorrect ? correctAnswers + 1 : correctAnswers;
    const nextScore = isCorrect ? score + 100 : score;

    MiniKit.commands.sendHapticFeedback({
      hapticsType: 'impact',
      style: 'light',
    });

    MiniKit.commands.sendHapticFeedback({
      hapticsType: 'notification',
      style: isCorrect ? 'success' : 'error',
    });

    setFeedback(isCorrect ? '¡Respuesta correcta!' : 'Respuesta incorrecta.');
    setTotalAnswers(nextTotal);
    setCorrectAnswers(nextCorrect);
    setScore(nextScore);
    void persistProgress(nextScore, nextCorrect, nextTotal);
  };

  return (
    <main className="p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Pantalla de juego</h1>
        <p className="text-gray-600">Interactúa con feedback háptico al responder.</p>
      </header>

      <section className="space-y-3 rounded-xl border p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{question.text}</h2>
        <p className="text-sm text-gray-600">Sesión actual: {sessionId}</p>
        <div className="flex gap-4 text-sm text-gray-700">
          <span>Puntaje: {score}</span>
          <span>Respuestas correctas: {correctAnswers}</span>
          <span>Preguntas contestadas: {totalAnswers}</span>
        </div>
        <div className="grid gap-3">
          {question.options.map((option, index) => (
            <button
              key={option}
              type="button"
              className="rounded-lg border px-4 py-3 text-left transition hover:bg-blue-50"
              onClick={() => handleAnswerSelection(index)}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      {feedback && <div className="rounded-md bg-blue-50 px-4 py-3 text-blue-800">{feedback}</div>}

      <section className="rounded-lg border px-4 py-3 text-sm text-gray-700">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Sincronización:</span>
          {saving ? <span>Guardando progreso...</span> : <span>Progreso sincronizado</span>}
          {lastSavedAt && <span className="text-gray-500">Último guardado: {lastSavedAt}</span>}
        </div>
        {saveError && <p className="mt-2 text-red-600">{saveError}</p>}
      </section>
    </main>
  );
}
