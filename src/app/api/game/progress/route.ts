import { NextRequest, NextResponse } from 'next/server';
import { upsertGameProgress } from '@/lib/database';
import { requireActiveSession } from '@/lib/sessionValidation';

export async function POST(req: NextRequest) {
  const { sessionId, score, correctAnswers, totalQuestions, mode, tournamentId } = await req.json();
  const sessionResult = await requireActiveSession(req, {
    path: 'game/progress',
    audit: { action: 'sync_game_progress', entity: 'game_progress', entityId: sessionId },
  });

  if ('error' in sessionResult) {
    return sessionResult.error;
  }

  const { identity, sessionToken } = sessionResult;

  const normalizedMode = mode === 'tournament' ? 'tournament' : 'quick';
  if (normalizedMode === 'tournament' && !tournamentId) {
    return NextResponse.json({ error: 'tournamentId es obligatorio en modo torneo' }, { status: 400 });
  }

  const normalizedScore = Number(score ?? 0);
  const normalizedCorrect = Number(correctAnswers ?? 0);
  const normalizedTotal = Number(totalQuestions ?? 0);

  if (!Number.isFinite(normalizedScore) || normalizedScore < 0) {
    return NextResponse.json({ error: 'El puntaje enviado no es válido' }, { status: 400 });
  }

  const saved = await upsertGameProgress(
    {
      session_id: sessionId ?? sessionToken,
      user_id: identity.user_id,
      mode: normalizedMode,
      tournament_id: normalizedMode === 'tournament' ? tournamentId : undefined,
      score: normalizedScore,
      correct_answers: Number.isFinite(normalizedCorrect) ? normalizedCorrect : 0,
      total_questions: Number.isFinite(normalizedTotal) ? normalizedTotal : 0,
      session_token: sessionToken,
    },
    { userId: identity.user_id, sessionId: sessionToken }
  );

  return NextResponse.json({ success: true, progress: saved });
}
