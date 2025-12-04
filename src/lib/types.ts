export type Question = {
  id: string;
  text: string;
  answers: string[];
  correctIndex: number;
  difficulty: number;
};

export type GameSession = {
  sessionId: string;
  userId: string;
  mode: 'quick' | 'tournament';
  tournamentId?: string;
  startedAt: Date;
  finishedAt?: Date;
  status: 'pending' | 'completed' | 'failed';
  answers: { questionId: string; answerIndex: number; isCorrect: boolean }[];
  currentQuestionIndex: number;
};
