import { NextRequest, NextResponse } from 'next/server';
import { deleteUserDataset, exportUserDataset, findWorldIdVerificationBySession } from '@/lib/database';
import { deletePlayerStats, exportPlayerProfile } from '@/lib/server/playerStatsStore';

const DATA_RETENTION_DAYS = 30;

function buildUnauthorizedResponse() {
  return NextResponse.json({ error: 'Usuario no verificado' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const session = req.cookies.get('session_token');
  if (!session) return buildUnauthorizedResponse();

  const identity = await findWorldIdVerificationBySession(session.value);
  if (!identity) return buildUnauthorizedResponse();

  const [dataset, profile] = await Promise.all([
    exportUserDataset(identity.user_id),
    exportPlayerProfile(identity.user_id),
  ]);

  return NextResponse.json({
    dataset,
    profile,
    retentionDays: DATA_RETENTION_DAYS,
  });
}

export async function DELETE(req: NextRequest) {
  const session = req.cookies.get('session_token');
  if (!session) return buildUnauthorizedResponse();

  const identity = await findWorldIdVerificationBySession(session.value);
  if (!identity) return buildUnauthorizedResponse();

  const [eraseResult, statsResult] = await Promise.all([
    deleteUserDataset(identity.user_id, { userId: identity.user_id, sessionId: session.value }),
    deletePlayerStats(identity.user_id),
  ]);

  return NextResponse.json({
    success: true,
    message: 'Datos personales eliminados conforme a GDPR/CCPA',
    removed: { ...eraseResult.removed, playerStats: statsResult.removed },
  });
}
