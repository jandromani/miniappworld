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

export interface Tournament {
  tournamentId: string;
  name: string;
  buyInToken: 'WLD' | 'USDC' | 'MEMECOIN';
  buyInAmount: string;
  prizePool: string;
  maxPlayers: number;
  currentPlayers: number;
  startTime: Date;
  endTime: Date;
  status: 'upcoming' | 'active' | 'finished';
  prizeDistribution: number[];
}

export interface TournamentEntry {
  tournamentId: string;
  userId: string;
  walletAddress: string;
  username: string;
  score: number;
  rank?: number;
  finishedAt: Date;
  prize?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  walletAddress: string;
  score: number;
  prize?: string;
  isCurrentUser?: boolean;
}
