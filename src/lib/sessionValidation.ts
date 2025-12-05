import { NextRequest } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { WorldIdVerificationRecord, findWorldIdVerificationBySession, recordAuditEvent } from '@/lib/database';

export type SessionValidationAudit = {
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
};

export type SessionValidationOptions = {
  path: string;
  audit?: SessionValidationAudit;
};

export type SessionValidationResult =
  | { error: ReturnType<typeof apiErrorResponse> }
  | { sessionToken: string; identity: WorldIdVerificationRecord };

export async function requireActiveSession(
  req: NextRequest,
  options: SessionValidationOptions
): Promise<SessionValidationResult> {
  const sessionToken = req.cookies.get('session_token')?.value;
  const details = options.audit?.details ?? {};

  if (!sessionToken) {
    if (options.audit) {
      await recordAuditEvent({
        action: options.audit.action,
        entity: options.audit.entity,
        entityId: options.audit.entityId,
        status: 'error',
        details: { ...details, reason: 'missing_session_token' },
      });
    }

    return {
      error: apiErrorResponse('SESSION_REQUIRED', {
        message: 'Sesión no verificada. Realiza la verificación de World ID.',
        path: options.path,
      }),
    };
  }

  const identity = await findWorldIdVerificationBySession(sessionToken);

  if (!identity) {
    if (options.audit) {
      await recordAuditEvent({
        action: options.audit.action,
        entity: options.audit.entity,
        entityId: options.audit.entityId,
        sessionId: sessionToken,
        status: 'error',
        details: { ...details, reason: 'session_not_found' },
      });
    }

    return {
      error: apiErrorResponse('SESSION_INVALID', {
        message: 'Sesión inválida o expirada. Vuelve a verificar tu identidad.',
        path: options.path,
      }),
    };
  }

  return { sessionToken, identity };
}
