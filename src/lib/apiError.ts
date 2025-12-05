import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

export type ApiLogLevel = 'info' | 'warn' | 'error';

export type ApiErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_WALLET'
  | 'CONFIG_MISSING'
  | 'CONFLICT'
  | 'VERIFICATION_FAILED'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_TOKEN'
  | 'SESSION_REQUIRED'
  | 'SESSION_INVALID'
  | 'FORBIDDEN'
  | 'REFERENCE_CONFLICT'
  | 'REFERENCE_NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'PAYMENT_STATUS_ERROR'
  | 'PAYMENT_REJECTED'
  | 'TRANSACTION_INVALID'
  | 'WALLET_MISMATCH'
  | 'TOKEN_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'TOURNAMENT_MISMATCH'
  | 'IDENTITY_MISMATCH'
  | 'INTERNAL_ERROR';

const LOG_HASH_SECRET = process.env.LOG_HASH_SECRET ?? 'log_salt';

const ERROR_DEFINITIONS: Record<
  ApiErrorCode,
  { status: number; defaultMessage: string; level: ApiLogLevel }
> = {
  INVALID_PAYLOAD: { status: 400, defaultMessage: 'Solicitud inválida', level: 'warn' },
  INVALID_WALLET: { status: 400, defaultMessage: 'wallet_address no es válida', level: 'warn' },
  CONFIG_MISSING: { status: 500, defaultMessage: 'Configuración faltante', level: 'error' },
  CONFLICT: { status: 409, defaultMessage: 'Conflicto con el estado actual', level: 'warn' },
  VERIFICATION_FAILED: { status: 400, defaultMessage: 'No se pudo verificar la solicitud', level: 'error' },
  UNAUTHORIZED: { status: 401, defaultMessage: 'No autorizado', level: 'warn' },
  RATE_LIMITED: { status: 429, defaultMessage: 'Demasiadas solicitudes', level: 'warn' },
  NOT_FOUND: { status: 404, defaultMessage: 'Recurso no encontrado', level: 'warn' },
  UNSUPPORTED_TOKEN: { status: 400, defaultMessage: 'Token no soportado', level: 'warn' },
  SESSION_REQUIRED: { status: 401, defaultMessage: 'Sesión no verificada', level: 'warn' },
  SESSION_INVALID: { status: 401, defaultMessage: 'Sesión inválida o expirada', level: 'warn' },
  FORBIDDEN: { status: 403, defaultMessage: 'Operación no permitida', level: 'warn' },
  REFERENCE_CONFLICT: { status: 403, defaultMessage: 'Referencia usada por otro usuario', level: 'warn' },
  REFERENCE_NOT_FOUND: { status: 400, defaultMessage: 'Referencia no encontrada', level: 'warn' },
  UPSTREAM_ERROR: { status: 502, defaultMessage: 'Error al consultar el servicio externo', level: 'error' },
  PAYMENT_STATUS_ERROR: { status: 400, defaultMessage: 'No se pudo validar el estado del pago', level: 'warn' },
  PAYMENT_REJECTED: { status: 400, defaultMessage: 'Pago rechazado', level: 'warn' },
  TRANSACTION_INVALID: { status: 400, defaultMessage: 'Transacción inválida', level: 'warn' },
  WALLET_MISMATCH: { status: 400, defaultMessage: 'La wallet no coincide', level: 'warn' },
  TOKEN_MISMATCH: { status: 400, defaultMessage: 'El token no coincide con lo esperado', level: 'warn' },
  AMOUNT_MISMATCH: { status: 400, defaultMessage: 'El monto no coincide con lo esperado', level: 'warn' },
  TOURNAMENT_MISMATCH: { status: 400, defaultMessage: 'El torneo no coincide con lo esperado', level: 'warn' },
  IDENTITY_MISMATCH: { status: 403, defaultMessage: 'La identidad verificada no coincide', level: 'warn' },
  INTERNAL_ERROR: { status: 500, defaultMessage: 'Error interno del servidor', level: 'error' },
};

function hashValue(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return `hash:${createHash('sha256').update(LOG_HASH_SECRET + serialized).digest('hex')}`;
}

function shouldAnonymizeKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('wallet') ||
    normalized.includes('user') ||
    normalized.includes('session') ||
    normalized.includes('token') ||
    normalized.includes('address') ||
    normalized.includes('reference') ||
    normalized.includes('nullifier') ||
    normalized.includes('transaction')
  );
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeValue(nestedValue, nestedKey),
      ])
    );
  }

  if (key && shouldAnonymizeKey(key)) {
    return hashValue(value);
  }

  return value;
}

function logStructured(level: ApiLogLevel, event: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    ...event,
  };

  const serialized = JSON.stringify(sanitizeValue(payload));

  switch (level) {
    case 'info':
      console.info(serialized);
      break;
    case 'warn':
      console.warn(serialized);
      break;
    case 'error':
    default:
      console.error(serialized);
      break;
  }
}

export function logApiEvent(level: ApiLogLevel, event: Record<string, unknown>) {
  logStructured(level, { type: 'api_event', ...event });
}

export function apiErrorResponse(
  code: ApiErrorCode,
  options: {
    message?: string;
    details?: Record<string, unknown>;
    status?: number;
    context?: string;
    path?: string;
  } = {}
) {
  const definition = ERROR_DEFINITIONS[code];
  const status = options.status ?? definition.status;
  const message = options.message ?? definition.defaultMessage;

  logStructured(definition.level, {
    type: 'api_error',
    code,
    message,
    status,
    context: options.context,
    path: options.path,
    details: options.details,
  });

  return NextResponse.json({ success: false, code, message }, { status });
}
