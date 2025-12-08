import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeText } from '@/lib/sanitize';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import { recordApiFailureMetric, recordWorkflowError, startQueueTracking } from '@/lib/metrics';
import { validateSameOrigin } from '@/lib/security';
import { checksumAddress, isValidEvmAddress } from '@/lib/addressValidation';
import { createRateLimiter } from '@/lib/rateLimit';
import { validateCriticalEnvVars } from '@/lib/envValidation';
import { appendNotificationAuditEvent } from '@/lib/notificationAuditLog';
import { hashNotificationApiKey } from '@/lib/notificationApiKeys';
import { fetchWithBackoff } from '@/lib/fetchWithBackoff';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const NONCE_TTL_MS = 5 * 60_000;

const nonceCache = new Map<string, number>();

const notificationRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  prefix: 'notifications',
});

type NotificationApiKey = {
  value: string;
  expiresAt?: Date;
};

type AuthResult =
  | { status: 'ok'; providedKey: string; key: NotificationApiKey }
  | { status: 'missing'; providedKey: null }
  | { status: 'expired'; providedKey: string }
  | { status: 'invalid'; providedKey: string }
  | { status: 'no_active_keys'; providedKey: string | null };

function parseApiKeyEntry(entry: unknown, index: number): NotificationApiKey {
  if (typeof entry === 'string') {
    if (entry.trim().length === 0) {
      throw new Error(`NOTIFICATIONS_API_KEYS[${index}] no puede ser una cadena vacía`);
    }

    return { value: entry };
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error(`Entrada de NOTIFICATIONS_API_KEYS inválida en índice ${index}`);
  }

  const { key, expiresAt } = entry as { key?: unknown; expiresAt?: unknown };

  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error(`NOTIFICATIONS_API_KEYS[${index}] debe incluir una clave no vacía`);
  }

  let parsedExpires: Date | undefined;

  if (expiresAt !== undefined) {
    if (typeof expiresAt !== 'string' || expiresAt.trim().length === 0) {
      throw new Error(`NOTIFICATIONS_API_KEYS[${index}].expiresAt debe ser una fecha en formato ISO`);
    }

    parsedExpires = new Date(expiresAt);

    if (Number.isNaN(parsedExpires.getTime())) {
      throw new Error(`NOTIFICATIONS_API_KEYS[${index}].expiresAt no es una fecha válida`);
    }
  }

  return { value: key, expiresAt: parsedExpires };
}

function loadConfiguredKeys(): NotificationApiKey[] {
  const multiKeyValue = process.env.NOTIFICATIONS_API_KEYS;
  const singleKeyValue = process.env.NOTIFICATIONS_API_KEY;

  if (!multiKeyValue && !singleKeyValue) {
    throw new Error('Debe definir NOTIFICATIONS_API_KEYS (JSON) o NOTIFICATIONS_API_KEY para usar /api/send-notification');
  }

  if (multiKeyValue) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(multiKeyValue);
    } catch (error) {
      throw new Error('NOTIFICATIONS_API_KEYS debe ser un arreglo JSON de objetos { key, expiresAt? }');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('NOTIFICATIONS_API_KEYS debe ser un arreglo JSON con al menos una entrada');
    }

    return parsed.map((entry, index) => parseApiKeyEntry(entry, index));
  }

  return [{ value: singleKeyValue as string }];
}

const configuredNotificationKeys = loadConfiguredKeys();

function isActiveKey(key: NotificationApiKey, now: Date) {
  return !key.expiresAt || key.expiresAt.getTime() > now.getTime();
}

function safeKeyCompare(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) return false;

  try {
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

function authenticateApiKey(providedKey: string | null): AuthResult {
  const now = new Date();
  const activeKeys = configuredNotificationKeys.filter((key) => isActiveKey(key, now));

  if (activeKeys.length === 0) {
    return { status: 'no_active_keys', providedKey };
  }

  if (!providedKey) {
    return { status: 'missing', providedKey: null };
  }

  const matchedKey = configuredNotificationKeys.find((key) => safeKeyCompare(providedKey, key.value));

  if (!matchedKey) {
    return { status: 'invalid', providedKey };
  }

  if (!isActiveKey(matchedKey, now)) {
    return { status: 'expired', providedKey };
  }

  return { status: 'ok', providedKey, key: matchedKey };
}

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function getAllowlistFromEnv(value?: string | null) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }

  return req.headers.get('x-real-ip') ?? 'unknown';
}

function isValidWalletAddress(address: unknown): address is string {
  return typeof address === 'string' && isValidEvmAddress(address);
}

function normalizeWalletAddress(address: string) {
  return checksumAddress(address);
}

type PayloadValidationResult = {
  errors: string[];
  resolvedWalletAddresses: string[];
  nonce?: string;
};

function validatePayload(body: any): PayloadValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    errors.push('Payload inválido');
    return { errors, resolvedWalletAddresses: [] };
  }

  const { walletAddresses, title, message, miniAppPath, nonce } = body;
  const resolvedWalletAddresses: string[] = [];

  if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
    errors.push('walletAddresses debe ser un arreglo con al menos una dirección');
  } else {
    if (walletAddresses.length > 50) {
      errors.push('walletAddresses no puede incluir más de 50 direcciones por solicitud');
    }

    const invalidAddresses = walletAddresses.filter((addr: unknown) => !isValidWalletAddress(addr));
    if (invalidAddresses.length > 0) {
      errors.push('Algunas direcciones de wallet no son válidas');
    } else {
      walletAddresses.forEach((addr: string) => resolvedWalletAddresses.push(normalizeWalletAddress(addr)));
    }
  }

  if (typeof title !== 'string' || title.trim().length === 0 || title.length > 120) {
    errors.push('title es obligatorio y no puede superar 120 caracteres');
  }

  if (typeof message !== 'string' || message.trim().length === 0 || message.length > 500) {
    errors.push('message es obligatorio y no puede superar 500 caracteres');
  }

  if (typeof miniAppPath !== 'string' || miniAppPath.trim().length === 0 || miniAppPath.length > 200) {
    errors.push('miniAppPath es obligatorio y no puede superar 200 caracteres');
  }

  if (typeof nonce !== 'string' || nonce.trim().length < 16 || nonce.length > 128) {
    errors.push('nonce es obligatorio y debe tener entre 16 y 128 caracteres');
  }

  return { errors, resolvedWalletAddresses, nonce };
}

async function logAudit(event: {
  apiKey?: string | null;
  role?: string;
  walletCount?: number;
  clientIp?: string;
  origin?: string | null;
  fingerprint?: string;
  success: boolean;
  reason?: string;
}) {
  const apiKeyHash = event.apiKey ? hashNotificationApiKey(event.apiKey) : 'missing';
  const timestamp = new Date().toISOString();

  logApiEvent(event.success ? 'info' : 'warn', {
    path: 'send-notification',
    event: 'notification_audit',
    reason: event.reason,
  });

  await appendNotificationAuditEvent({
    timestamp,
    apiKeyHash,
    role: event.role,
    walletCount: event.walletCount,
    clientIp: event.clientIp,
    origin: event.origin,
    fingerprint: event.fingerprint,
    success: event.success,
    reason: event.reason,
  });
}

function getClientFingerprint(req: NextRequest, clientIp: string) {
  const userAgent = req.headers.get('user-agent') ?? 'unknown';
  const acceptLanguage = req.headers.get('accept-language') ?? 'unknown';
  return hashKey(`${clientIp}:${userAgent}:${acceptLanguage}`);
}

function isIpAllowed(clientIp: string) {
  const allowlist = getAllowlistFromEnv(process.env.NOTIFICATIONS_ALLOWED_IPS);
  if (allowlist.length === 0 || clientIp === 'unknown') return true;
  return allowlist.includes(clientIp);
}

function isOriginAllowed(origin: string | null) {
  const allowlist = getAllowlistFromEnv(process.env.NOTIFICATIONS_ALLOWED_ORIGINS);
  if (allowlist.length === 0 || !origin) return true;
  return allowlist.includes(origin);
}

function isNonceValid(nonce: string) {
  const now = Date.now();

  for (const [key, timestamp] of nonceCache) {
    if (now - timestamp > NONCE_TTL_MS) {
      nonceCache.delete(key);
    }
  }

  const exists = nonceCache.has(nonce);
  if (!exists) {
    nonceCache.set(nonce, now);
  }

  return !exists;
}

function mapAuthStatusToResponse(authResult: AuthResult) {
  switch (authResult.status) {
    case 'missing':
      return { status: 401, message: 'Falta API key' } as const;
    case 'expired':
      return { status: 401, message: 'API key expirada' } as const;
    case 'invalid':
      return { status: 401, message: 'API key inválida' } as const;
    case 'no_active_keys':
      return { status: 503, message: 'No hay API keys activas configuradas' } as const;
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const clientIp = getClientIp(req);
  const origin = req.headers.get('origin');
  const fingerprint = getClientFingerprint(req, clientIp);
  const providedKey = req.headers.get('x-api-key');
  const authResult = authenticateApiKey(providedKey);

  if (authResult.status !== 'ok') {
    const responseInfo = mapAuthStatusToResponse(authResult);
    await logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: authResult.status });
    recordApiFailureMetric('send-notification', authResult.status);
    return NextResponse.json({ success: false, message: responseInfo?.message ?? 'No autorizado' }, { status: responseInfo?.status ?? 401 });
  }

  if (!isIpAllowed(clientIp)) {
    await logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: 'ip_not_allowed' });
    recordApiFailureMetric('send-notification', 'ip_not_allowed');
    return NextResponse.json({ success: false, message: 'IP no permitida' }, { status: 403 });
  }

  if (!isOriginAllowed(origin)) {
    await logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: 'origin_not_allowed' });
    recordApiFailureMetric('send-notification', 'origin_not_allowed');
    return NextResponse.json({ success: false, message: 'Origen no permitido' }, { status: 403 });
  }

  const originCheck = validateSameOrigin(req);
  if (!originCheck.valid) {
    await logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: originCheck.reason });
    recordApiFailureMetric('send-notification', originCheck.reason ?? 'origin_check_failed');
    return NextResponse.json({ success: false, message: 'Solicitud no autorizada' }, { status: 403 });
  }

  const rateLimitResult = await notificationRateLimiter.limit(providedKey);
  if (!rateLimitResult.allowed) {
    await logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: 'rate_limited' });
    recordApiFailureMetric('send-notification', 'rate_limited');
    return apiErrorResponse('RATE_LIMITED', {
      message: 'Límite de solicitudes excedido, intente más tarde',
      path: 'send-notification',
    });
  }

  const body = await req.json();
  const { errors, resolvedWalletAddresses, nonce } = validatePayload(body);

  if (errors.length > 0) {
    await logAudit({
      apiKey: providedKey,
      walletCount: Array.isArray(body?.walletAddresses) ? body.walletAddresses.length : 0,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: `validation_failed:${errors.join('|')}`,
    });
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: errors.join('; '),
      path: 'send-notification',
      details: { validationErrors: errors },
    });
  }

  if (!nonce || !isNonceValid(nonce)) {
    await logAudit({
      apiKey: providedKey,
      walletCount: resolvedWalletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'replay_detected',
    });
    return NextResponse.json(
      { success: false, message: 'Solicitud duplicada detectada (nonce reutilizado)' },
      { status: 409 },
    );
  }

  const sanitizedTitle = sanitizeText(body.title);
  const sanitizedMessage = sanitizeText(body.message);
  const sanitizedMiniAppPath = sanitizeText(body.miniAppPath);

  if (!sanitizedTitle || !sanitizedMessage || !sanitizedMiniAppPath) {
    await logAudit({
      apiKey: providedKey,
      walletCount: resolvedWalletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'sanitization_failed',
    });
    return NextResponse.json(
      { success: false, message: 'Los campos title, message y miniAppPath deben contener texto válido' },
      { status: 400 },
    );
  }

  const finalizeQueue = startQueueTracking('notification_dispatch');

  try {
    const response = await fetchWithBackoff('https://developer.worldcoin.org/api/v2/minikit/send-notification', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEV_PORTAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: process.env.APP_ID,
        wallet_addresses: resolvedWalletAddresses,
        localisations: [
          {
            language: 'en',
            title: sanitizedTitle,
            message: sanitizedMessage,
          },
          {
            language: 'es',
            title: sanitizedTitle,
            message: sanitizedMessage,
          },
        ],
        mini_app_path: sanitizedMiniAppPath,
      }),
      timeoutMs: 7000,
      maxRetries: 3,
      initialDelayMs: 400,
    });

    const result = await response.json();

    if (!response.ok) {
      await logAudit({
        apiKey: providedKey,
        walletCount: resolvedWalletAddresses.length,
        clientIp,
        origin,
        fingerprint,
        success: false,
        reason: `upstream_status_${response.status}`,
      });
      recordApiFailureMetric('send-notification', `upstream_${response.status}`);
      finalizeQueue('error');
      return apiErrorResponse('UPSTREAM_ERROR', {
        message: result?.message ?? 'No se pudo enviar la notificación. Considere enrutar el envío a un servicio backend protegido.',
        path: 'send-notification',
      });
    }

    await logAudit({
      apiKey: providedKey,
      walletCount: resolvedWalletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: true,
    });

    logApiEvent('info', {
      path: 'send-notification',
      action: 'dispatch',
      walletCount: resolvedWalletAddresses.length,
      status: response.status,
    });

    finalizeQueue('success');
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    await logAudit({
      apiKey: providedKey,
      walletCount: resolvedWalletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'upstream_error',
    });
    recordApiFailureMetric('send-notification', 'upstream_error');
    recordWorkflowError('notification_dispatch', 'upstream_error');
    finalizeQueue('error');

    return apiErrorResponse('UPSTREAM_ERROR', {
      message: 'No se pudo enviar la notificación. Considere enrutar el envío a un servicio backend protegido.',
      path: 'send-notification',
      details: { error: (error as Error)?.message },
    });
  }
}
