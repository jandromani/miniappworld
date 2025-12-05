import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyCloudProof } from '@worldcoin/minikit-js';
import { ApiLogLevel, apiErrorResponse, logApiEvent, type ApiErrorCode } from '@/lib/apiError';
import {
  findWorldIdVerificationByNullifier,
  findWorldIdVerificationByUser,
  insertWorldIdVerification,
  isLocalStorageDisabled,
} from '@/lib/database';
import { DEFAULT_WORLD_ID_ACTION, isValidWorldIdAction, type WorldIdAction } from '@/lib/worldId';
import { validateCriticalEnvVars } from '@/lib/envValidation';

const SESSION_COOKIE = 'session_token';
const PATH = 'verify-world-id';

type VerifyCloudProofErrorCode =
  | 'action_mismatch'
  | 'invalid_action'
  | 'invalid_app_id'
  | 'invalid_nullifier'
  | 'invalid_merkle_root'
  | 'nullifier_used'
  | 'rate_limited'
  | 'request_expired'
  | 'signature_invalid'
  | 'verification_failed'
  | string;

type VerifyErrorMapping = {
  apiCode: ApiErrorCode;
  message: string;
  status?: number;
  logLevel: ApiLogLevel;
  reason: string;
};

const VERIFY_CLOUD_PROOF_ERRORS: Partial<Record<VerifyCloudProofErrorCode, VerifyErrorMapping>> = {
  invalid_app_id: {
    apiCode: 'CONFIG_MISSING',
    message: 'Configuración de World ID inválida en el servidor',
    status: 500,
    logLevel: 'error',
    reason: 'invalid_app_id',
  },
  action_mismatch: {
    apiCode: 'FORBIDDEN',
    message: 'La prueba no corresponde a la acción solicitada',
    status: 403,
    logLevel: 'warn',
    reason: 'action_mismatch',
  },
  invalid_action: {
    apiCode: 'FORBIDDEN',
    message: 'La acción enviada no coincide con la configuración de World ID',
    status: 403,
    logLevel: 'warn',
    reason: 'invalid_action',
  },
  invalid_nullifier: {
    apiCode: 'CONFLICT',
    message: 'Identidad de World ID no válida o ya utilizada',
    status: 409,
    logLevel: 'warn',
    reason: 'invalid_nullifier',
  },
  nullifier_used: {
    apiCode: 'CONFLICT',
    message: 'Esta identidad ya fue utilizada anteriormente',
    status: 409,
    logLevel: 'warn',
    reason: 'nullifier_used',
  },
  invalid_merkle_root: {
    apiCode: 'VERIFICATION_FAILED',
    message: 'La raíz de Merkle no coincide con la prueba',
    status: 400,
    logLevel: 'error',
    reason: 'invalid_merkle_root',
  },
  verification_failed: {
    apiCode: 'VERIFICATION_FAILED',
    message: 'La prueba de World ID es inválida o incompleta',
    status: 400,
    logLevel: 'warn',
    reason: 'verification_failed',
  },
  rate_limited: {
    apiCode: 'RATE_LIMITED',
    message: 'Demasiadas verificaciones recientes, intenta de nuevo en unos minutos',
    status: 429,
    logLevel: 'warn',
    reason: 'rate_limited',
  },
  request_expired: {
    apiCode: 'VERIFICATION_FAILED',
    message: 'La prueba de World ID expiró. Repite la verificación en la app.',
    status: 400,
    logLevel: 'warn',
    reason: 'request_expired',
  },
  signature_invalid: {
    apiCode: 'VERIFICATION_FAILED',
    message: 'Firma de la prueba inválida',
    status: 400,
    logLevel: 'error',
    reason: 'signature_invalid',
  },
};

function mapVerifyCloudProofError(verifyRes: unknown, actionName: WorldIdAction) {
  const code = (verifyRes as { code?: string })?.code ?? 'unknown_error';
  const mapping = VERIFY_CLOUD_PROOF_ERRORS[code];

  logApiEvent(mapping?.logLevel ?? 'error', {
    path: PATH,
    event: 'world-id_verify_failed',
    action: actionName,
    verifyCode: code,
    reason: mapping?.reason ?? 'unmapped_error',
    details: verifyRes,
  });

  return apiErrorResponse(mapping?.apiCode ?? 'VERIFICATION_FAILED', {
    message: mapping?.message ?? 'No se pudo verificar la prueba de World ID',
    status: mapping?.status,
    details: { verifyRes, verifyCode: code },
    path: PATH,
  });
}

export async function POST(req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  try {
    const { proof, nullifier_hash, merkle_root, wallet_address, user_id, action, verification_level } =
      await req.json();

    if (!proof || !nullifier_hash || !merkle_root) {
      return apiErrorResponse('INVALID_PAYLOAD', {
        message: 'Faltan parámetros obligatorios (proof, nullifier_hash, merkle_root)',
        details: { nullifier_hash },
        path: PATH,
      });
    }

    if (wallet_address && !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return apiErrorResponse('INVALID_WALLET', {
        message: 'wallet_address no tiene un formato válido',
        details: { wallet_address },
        path: PATH,
      });
    }

    if (!process.env.APP_ID) {
      return apiErrorResponse('CONFIG_MISSING', {
        message: 'Configuración del servidor incompleta',
        details: { missing: 'APP_ID' },
        path: PATH,
      });
    }

    const actionCandidate = action ?? DEFAULT_WORLD_ID_ACTION;

    if (typeof actionCandidate !== 'string' || !isValidWorldIdAction(actionCandidate)) {
      console.warn('[verify-world-id] Acción no permitida', { action });
      return NextResponse.json(
        {
          success: false,
          error: 'Acción de verificación no permitida',
        },
        { status: 400 }
      );
    }

    const actionName = actionCandidate as WorldIdAction;

    const existingIdentity = await findWorldIdVerificationByNullifier(nullifier_hash);

    if (existingIdentity) {
      return apiErrorResponse('CONFLICT', {
        message: 'Esta identidad ya fue utilizada anteriormente',
        details: {
          nullifier_hash,
          existingUser: existingIdentity.user_id,
        },
        path: PATH,
      });
    }

    if (user_id) {
      const existingUserIdentity = await findWorldIdVerificationByUser(user_id);
      if (existingUserIdentity && existingUserIdentity.nullifier_hash !== nullifier_hash) {
        return apiErrorResponse('CONFLICT', {
          message: 'Este usuario ya está vinculado a otra identidad',
          details: {
            user_id,
            nullifier_hash,
            existingNullifier: existingUserIdentity.nullifier_hash,
          },
          path: PATH,
        });
      }
    }

    const verifyRes = await verifyCloudProof(
      { proof, nullifier_hash, merkle_root, verification_level: verification_level ?? 'orb' },
      process.env.APP_ID as `app_${string}`,
      actionName
    );

    if (!verifyRes.success) {
      return mapVerifyCloudProofError(verifyRes, actionName);
    }

    const sessionToken = randomUUID();
    const userId = user_id ?? nullifier_hash;

    const identityRecord = await insertWorldIdVerification({
      action: actionName,
      merkle_root,
      nullifier_hash,
      verification_level: verification_level ?? 'orb',
      wallet_address,
      user_id: userId,
      session_token: sessionToken,
    });
    const response = NextResponse.json({
      success: true,
      userId: identityRecord.user_id,
      nullifier_hash: identityRecord.nullifier_hash,
      createdAt: identityRecord.created_at,
    });

    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    logApiEvent('info', {
      path: PATH,
      event: 'world-id_verified',
      userId: identityRecord.user_id,
      sessionToken,
    });

    return response;
  } catch (error) {
    if (isLocalStorageDisabled(error)) {
      return NextResponse.json(
        { success: false, error: 'Persistencia local deshabilitada. Configure almacenamiento compartido o servicio remoto.' },
        { status: 503 }
      );
    }

    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'DUPLICATE_NULLIFIER') {
      return apiErrorResponse('CONFLICT', {
        message: 'Esta identidad ya fue utilizada anteriormente',
        details: { code },
        path: PATH,
      });
    }

    return apiErrorResponse('INTERNAL_ERROR', {
      message: 'Error interno al verificar World ID',
      details: { error: (error as Error)?.message },
      path: PATH,
    });
  }
}
