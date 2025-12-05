'use client';

import { useCallback, useMemo, useState } from 'react';
import { SessionVerificationBar } from '@/components/SessionVerificationBar';
import { sendNotificationHaptics } from '@/lib/haptics';
import { useHapticsPreference } from '@/lib/useHapticsPreference';

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
  const { hapticsEnabled } = useHapticsPreference();

  const sendHaptics = useCallback(
    async (isCorrect: boolean) => sendNotificationHaptics(isCorrect ? 'success' : 'error', hapticsEnabled),
    [hapticsEnabled],
  );

  const persistProgress = useCallback(
    async (nextScore: number, nextCorrect: number, nextTotal: number) => {
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
        const message =
          error instanceof Error ? error.message : 'Error inesperado al guardar progreso';
        setSaveError(message);
      } finally {
        setSaving(false);
      }
    },
    [sessionId],
  );

  const handleAnswerSelection = async (selectedIndex: number) => {
    const isCorrect = selectedIndex === question.correctIndex;
    const nextTotal = totalAnswers + 1;
    const nextCorrect = isCorrect ? correctAnswers + 1 : correctAnswers;
    const nextScore = isCorrect ? score + 100 : score;

    setFeedback(isCorrect ? '¡Respuesta correcta!' : 'Respuesta incorrecta.');
    setTotalAnswers(nextTotal);
    setCorrectAnswers(nextCorrect);
    setScore(nextScore);

    await sendHaptics(isCorrect);
    void persistProgress(nextScore, nextCorrect, nextTotal);
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6" aria-labelledby="game-heading">
      <header className="flex flex-col gap-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-blue-700">Modo práctica</p>
          <h1 id="game-heading" className="text-2xl font-bold sm:text-3xl">
            Pantalla de juego
          </h1>
          <p className="text-sm text-gray-600" id="question-hint">
            Responde las preguntas y obtén feedback háptico al instante. Optimizado para pantallas móviles.
          </p>
        </div>
        <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow-inner">
          <p className="font-semibold">Sesión</p>
          <p className="truncate text-gray-500" data-testid="session-id" aria-label="Identificador de sesión">
            {sessionId}
          </p>
        </div>
      </header>

      <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-900" aria-describedby="question-hint">
              {question.text}
            </h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Trivia
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 sm:grid-cols-3" data-testid="score-grid">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
              <p className="text-xs uppercase text-gray-500">Puntaje</p>
              <p className="text-lg font-semibold">{score}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
              <p className="text-xs uppercase text-gray-500">Correctas</p>
              <p className="text-lg font-semibold">{correctAnswers}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
              <p className="text-xs uppercase text-gray-500">Contestadas</p>
              <p className="text-lg font-semibold">{totalAnswers}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3" role="group" aria-label="Opciones de respuesta">
          {question.options.map((option, index) => (
            <button
              key={option}
              type="button"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-800 transition hover:-translate-y-0.5 hover:border-blue-500 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={() => handleAnswerSelection(index)}
              aria-describedby="question-hint"
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      {feedback && (
        <div
          className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </div>
      )}

      <section className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2 text-gray-800">
            <span className="font-semibold">Sincronización</span>
            <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-600">Auto</span>
          </div>
          <div className="flex flex-wrap items-center gap-3" data-testid="sync-status" role="status" aria-live="polite">
            {saving ? <span>Guardando progreso...</span> : <span>Progreso sincronizado</span>}
            {lastSavedAt && <span className="text-gray-500">Último guardado: {lastSavedAt}</span>}
          </div>
        </div>
        {saveError && <p className="mt-2 text-red-600">{saveError}</p>}
      </section>
    </main>
  );
}
