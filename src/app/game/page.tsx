'use client';

import { useState } from 'react';
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

  const handleAnswerSelection = (selectedIndex: number) => {
    const isCorrect = selectedIndex === question.correctIndex;

    MiniKit.commands.sendHapticFeedback({
      hapticsType: 'impact',
      style: 'light',
    });

    MiniKit.commands.sendHapticFeedback({
      hapticsType: 'notification',
      style: isCorrect ? 'success' : 'error',
    });

    setFeedback(isCorrect ? '¡Respuesta correcta!' : 'Respuesta incorrecta.');
  };

  return (
    <main className="p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Pantalla de juego</h1>
        <p className="text-gray-600">Interactúa con feedback háptico al responder.</p>
      </header>

      <section className="space-y-3 rounded-xl border p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{question.text}</h2>
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
    </main>
  );
}
