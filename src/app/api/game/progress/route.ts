import { NextRequest, NextResponse } from 'next/server';
import { findWorldIdVerificationBySession, recordAuditEvent, upsertGameProgress } from '@/lib/database';

const SESSION_COOKIE = 'session_token';

export async function POST(req: NextRequest) {
  const { sessionId, score, correctAnswers, totalQuestions, mode, tournamentId } = await req.json();
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    await recordAuditEvent({
      action: 'sync_game_progress',
      entity: 'game_progress',
      entityId: sessionId,
      status: 'error',
      details: { reason: 'missing_session_token' },
    });
    return NextResponse.json({ error: 'Sesión no verificada' }, { status: 401 });
  }

  const identity = await findWorldIdVerificationBySession(sessionToken);
  if (!identity) {
    await recordAuditEvent({
      action: 'sync_game_progress',
      entity: 'game_progress',
      entityId: sessionId,
      sessionId: sessionToken,
      status: 'error',
      details: { reason: 'session_not_found' },
    });
    return NextResponse.json({ error: 'La sesión expiró o no existe' }, { status: 401 });
  }

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
