import { NextRequest, NextResponse } from 'next/server';
import {
  findUserConsent,
  findWorldIdVerificationBySession,
  upsertUserConsent,
} from '@/lib/database';

const PRIVACY_POLICY = {
  version: '2024-10',
  retentionDays: 30,
  sensitiveFields: ['wallet_address', 'user_id'],
};

function buildUnauthorizedResponse() {
  return NextResponse.json({ error: 'Usuario no verificado' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const session = req.cookies.get('session_token');
  if (!session) return buildUnauthorizedResponse();

  const identity = await findWorldIdVerificationBySession(session.value);
  if (!identity) return buildUnauthorizedResponse();

  const consent = await findUserConsent(identity.user_id);

  return NextResponse.json({ policy: PRIVACY_POLICY, consent });
}

export async function POST(req: NextRequest) {
  const session = req.cookies.get('session_token');
  if (!session) return buildUnauthorizedResponse();

  const identity = await findWorldIdVerificationBySession(session.value);
  if (!identity) return buildUnauthorizedResponse();

  const body = await req.json();
  const {
    walletProcessing,
    userIdProcessing,
    retentionDays,
    channels,
    acceptPolicies,
  } = body as {
    walletProcessing?: boolean;
    userIdProcessing?: boolean;
    retentionDays?: number;
    channels?: string[];
    acceptPolicies?: boolean;
  };

  if (!acceptPolicies) {
    return NextResponse.json(
      { error: 'Debes aceptar la política de privacidad para continuar' },
      { status: 400 }
    );
  }

  const requestedRetention = Number.isFinite(retentionDays)
    ? Math.min(Number(retentionDays), PRIVACY_POLICY.retentionDays)
    : PRIVACY_POLICY.retentionDays;

  const consent = await upsertUserConsent(
    {
      user_id: identity.user_id,
      policy_version: PRIVACY_POLICY.version,
      wallet_processing: walletProcessing ?? true,
      user_id_processing: userIdProcessing ?? true,
      retention_days: requestedRetention,
      channels: channels?.slice(0, 5),
    },
    { userId: identity.user_id, sessionId: session.value }
  );

  return NextResponse.json({ consent, policy: PRIVACY_POLICY });
}
