export interface Question {
  id: string; // UUID único
  category: string; // "Historia", "Ciencia", "Deportes", etc.
  difficulty: 1 | 2 | 3 | 4 | 5; // 1=fácil, 5=muy difícil
  text: string; // Enunciado de la pregunta
  options: [string, string, string, string]; // Exactamente 4 opciones
  correctIndex: 0 | 1 | 2 | 3; // Índice de la opción correcta
  maxTime: number; // Tiempo máximo en segundos (ej: 30)
  points: number; // Puntos que otorga (ej: 100 * difficulty)
}

export interface GameSession {
  sessionId: string; // UUID de la sesión
  userId: string; // nullifier_hash de World ID (prueba de persona única)
  mode: "quick" | "tournament" | "practice";
  tournamentId?: string; // Solo si mode === "tournament"
  questions: Question[]; // Array de 15 preguntas ordenadas por dificultad
  currentQuestionIndex: number; // 0-14
  answers: Array<{
    questionId: string;
    selectedIndex: number | null; // null si no respondió (timeout)
    isCorrect: boolean;
    timeSpent: number; // Segundos
  }>;
  lifelines: {
    fiftyFifty: boolean; // true si aún disponible
    askAudience: boolean;
    changeQuestion: boolean;
  };
  score: number; // Puntos acumulados
  startedAt: Date;
  finishedAt?: Date;
  status: "in_progress" | "completed" | "failed";
}

export interface PlayerStats {
  userId: string; // nullifier_hash de World ID
  walletAddress: string; // Dirección de wallet (de Wallet Auth)
  username: string; // Username de World App
  totalGamesPlayed: number;
  totalWins: number;
  totalLosses: number;
  highestScore: number;
  averageScore: number;
  tournamentsWon: number;
  totalEarnings: string; // En WLD/USDC (formato string para BigInt)
  lastPlayedAt: Date;
}

export interface Tournament {
  tournamentId: string;
  buyInToken: "WLD" | "USDC" | "MEMECOIN"; // Token del buy-in
  buyInAmount: string; // Cantidad en wei (string para BigInt)
  prizePool: string; // Acumulado en wei
  participants: Array<{
    userId: string;
    score: number;
    finishedAt: Date;
  }>;
  startedAt: Date;
  endsAt: Date;
  status: "open" | "in_progress" | "finished";
  winners?: Array<{
    userId: string;
    rank: number;
    prize: string; // En wei
  }>;
}
