import { MiniKit } from "@worldcoin/minikit-js";
import { Question } from "./questions";

type Lifeline = "fiftyFifty" | "skip" | "askAudience";

export type GameState = {
  currentQuestion: Question;
  currentIndex: number;
  prizeTotal: number;
  eliminatedOptions: number[];
  lifelines: Record<Lifeline, boolean>;
};

export function initialState(deck: Question[]): GameState {
  return {
    currentQuestion: deck[0],
    currentIndex: 0,
    prizeTotal: 0,
    eliminatedOptions: [],
    lifelines: {
      fiftyFifty: false,
      skip: false,
      askAudience: false,
    },
  };
}

export function evaluateAnswer(state: GameState, answerIndex: number) {
  const correct = state.currentQuestion.correctIndex === answerIndex;
  const prize = correct ? state.prizeTotal + state.currentQuestion.prize : state.prizeTotal;

  if (correct) {
    MiniKit.commands.sendHapticFeedback({ hapticsType: "notification", style: "success" });
  } else {
    MiniKit.commands.sendHapticFeedback({ hapticsType: "notification", style: "error" });
  }

  return {
    correct,
    prize,
  };
}

export function nextQuestion(deck: Question[], state: GameState) {
  const nextIndex = state.currentIndex + 1;
  const hasMore = nextIndex < deck.length;
  return hasMore
    ? {
        ...state,
        currentIndex: nextIndex,
        currentQuestion: deck[nextIndex],
        eliminatedOptions: [],
      }
    : state;
}

export function useLifeline(state: GameState, lifeline: Lifeline): GameState {
  if (state.lifelines[lifeline]) return state;

  if (lifeline === "fiftyFifty") {
    const incorrectOptions = state.currentQuestion.answers
      .map((_, idx) => idx)
      .filter((idx) => idx !== state.currentQuestion.correctIndex);
    const eliminated = incorrectOptions.slice(0, 2);
    return {
      ...state,
      eliminatedOptions: eliminated,
      lifelines: { ...state.lifelines, fiftyFifty: true },
    };
  }

  if (lifeline === "skip") {
    MiniKit.commands.sendHapticFeedback({ hapticsType: "impact", style: "light" });
    return {
      ...state,
      lifelines: { ...state.lifelines, skip: true },
    };
  }

  if (lifeline === "askAudience") {
    MiniKit.commands.sendHapticFeedback({ hapticsType: "impact", style: "medium" });
    return {
      ...state,
      lifelines: { ...state.lifelines, askAudience: true },
    };
  }

  return state;
}
