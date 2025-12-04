import { MiniKit } from "@worldcoin/minikit-js";
import { GameSession, Question } from "./types";
import { getAlternateQuestion } from "./questions";

export type Lifeline = "fiftyFifty" | "askAudience" | "changeQuestion";

export type RuntimeState = {
  session: GameSession;
  eliminatedOptions: number[];
  audiencePoll?: number[];
  usedQuestionIds: Set<string>;
};

export function createRuntimeState(
  deck: Question[],
  userId: string,
  mode: GameSession["mode"],
  tournamentId?: string,
): RuntimeState {
  const session: GameSession = {
    sessionId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    userId,
    mode,
    tournamentId,
    questions: deck,
    currentQuestionIndex: 0,
    answers: [],
    lifelines: {
      fiftyFifty: true,
      askAudience: true,
      changeQuestion: true,
    },
    score: 0,
    startedAt: new Date(),
    status: "in_progress",
  };

  return {
    session,
    eliminatedOptions: [],
    usedQuestionIds: new Set(deck.map((question) => question.id)),
  };
}

export function evaluateAnswer(
  runtime: RuntimeState,
  selectedIndex: number,
  timeSpent: number,
): { runtime: RuntimeState; correct: boolean } {
  const currentQuestion = runtime.session.questions[runtime.session.currentQuestionIndex];
  const isCorrect = currentQuestion.correctIndex === selectedIndex;
  const updatedScore = isCorrect ? runtime.session.score + currentQuestion.points : runtime.session.score;

  triggerHaptics(isCorrect ? "success" : "error");

  const updatedAnswers = [
    ...runtime.session.answers,
    {
      questionId: currentQuestion.id,
      selectedIndex,
      isCorrect,
      timeSpent,
    },
  ];

  const updatedSession: GameSession = {
    ...runtime.session,
    answers: updatedAnswers,
    score: updatedScore,
  };

  return {
    runtime: {
      ...runtime,
      session: updatedSession,
      eliminatedOptions: [],
      audiencePoll: undefined,
    },
    correct: isCorrect,
  };
}

export function advance(runtime: RuntimeState, completedStatus: "completed" | "failed") {
  const nextIndex = runtime.session.currentQuestionIndex + 1;
  const hasMore = nextIndex < runtime.session.questions.length;

  const status = hasMore ? runtime.session.status : completedStatus;
  return {
    ...runtime,
    session: {
      ...runtime.session,
      currentQuestionIndex: hasMore ? nextIndex : runtime.session.currentQuestionIndex,
      status,
      finishedAt: status !== "in_progress" ? new Date() : runtime.session.finishedAt,
    },
    eliminatedOptions: [],
    audiencePoll: undefined,
  } as RuntimeState;
}

export function timeout(runtime: RuntimeState, timeSpent: number) {
  const currentQuestion = runtime.session.questions[runtime.session.currentQuestionIndex];
  const updatedAnswers = [
    ...runtime.session.answers,
    {
      questionId: currentQuestion.id,
      selectedIndex: null,
      isCorrect: false,
      timeSpent,
    },
  ];

  const session: GameSession = {
    ...runtime.session,
    answers: updatedAnswers,
    status: "failed",
    finishedAt: new Date(),
  };

  triggerHaptics("error");

  return { ...runtime, session, eliminatedOptions: [], audiencePoll: undefined };
}

export function useLifeline(
  runtime: RuntimeState,
  lifeline: Lifeline,
): RuntimeState & { audiencePoll?: number[] } {
  if (!runtime.session.lifelines[lifeline] || runtime.session.status !== "in_progress") {
    return runtime;
  }

  if (lifeline === "fiftyFifty") {
    const incorrect = runtime.session.questions[runtime.session.currentQuestionIndex].options
      .map((_, idx) => idx)
      .filter((idx) => idx !== runtime.session.questions[runtime.session.currentQuestionIndex].correctIndex)
      .slice(0, 2);

    return {
      ...runtime,
      eliminatedOptions: incorrect,
      session: {
        ...runtime.session,
        lifelines: { ...runtime.session.lifelines, fiftyFifty: false },
      },
    };
  }

  if (lifeline === "askAudience") {
    const poll = createAudiencePoll(runtime.session.questions[runtime.session.currentQuestionIndex].correctIndex);
    triggerHaptics("medium");
    return {
      ...runtime,
      audiencePoll: poll,
      session: {
        ...runtime.session,
        lifelines: { ...runtime.session.lifelines, askAudience: false },
      },
    };
  }

  if (lifeline === "changeQuestion") {
    const currentQuestion = runtime.session.questions[runtime.session.currentQuestionIndex];
    const alternate = getAlternateQuestion(currentQuestion, runtime.usedQuestionIds);
    if (!alternate) return runtime;

    const updatedQuestions = runtime.session.questions.map((question, idx) =>
      idx === runtime.session.currentQuestionIndex ? alternate : question,
    );
    const updatedUsed = new Set(runtime.usedQuestionIds);
    updatedUsed.add(alternate.id);

    triggerHaptics("light");

    return {
      ...runtime,
      session: {
        ...runtime.session,
        questions: updatedQuestions,
        lifelines: { ...runtime.session.lifelines, changeQuestion: false },
      },
      eliminatedOptions: [],
      audiencePoll: undefined,
      usedQuestionIds: updatedUsed,
    };
  }

  return runtime;
}

function triggerHaptics(style: "success" | "error" | "light" | "medium") {
  try {
    if (style === "light" || style === "medium") {
      MiniKit.commands.sendHapticFeedback({ hapticsType: "impact", style });
      return;
    }
    MiniKit.commands.sendHapticFeedback({ hapticsType: "notification", style });
  } catch (error) {
    console.warn("Haptic feedback not available", error);
  }
}

function createAudiencePoll(correctIndex: number) {
  const base = [15, 20, 25, 40];
  const shifted = base.map((value, idx) => (idx === correctIndex ? value + 20 : value));
  const total = shifted.reduce((sum, value) => sum + value, 0);
  return shifted.map((value) => Math.round((value / total) * 100));
}
