import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { sanitizeText } from '@/lib/sanitize';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
import { validateSameOrigin } from '@/lib/security';
import { createRateLimiter } from '@/lib/rateLimit';
import { validateCriticalEnvVars } from '@/lib/envValidation';
import { appendNotificationAuditEvent } from '@/lib/notificationAuditLog';
import { hashNotificationApiKey, resolveNotificationApiKey } from '@/lib/notificationApiKeys';

type NotificationApiKey = {
  value: string;
  expiresAt?: Date;
};

type RateLimitEntry = {
  windowStart: number;
  count: number;
};

type AuthResult = {
  providedKey?: string | null;
  role?: string;
  authorized: boolean;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const NONCE_TTL_MS = 5 * 60_000;

const rateLimitByKey = new Map<string, RateLimitEntry>();
const nonceCache = new Map<string, number>();

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

function authenticateApiKey(providedKey: string | null) {
  const now = new Date();

  if (!providedKey) {
    return { authenticated: false, reason: 'missing_api_key' as const };
  }

  const matchedKey = configuredNotificationKeys.find((key) => safeKeyCompare(providedKey, key.value));

  if (matchedKey && !isActiveKey(matchedKey, now)) {
    return { authenticated: false, reason: 'key_expired' as const };
  }

  const activeMatch = configuredNotificationKeys.find(
    (key) => isActiveKey(key, now) && safeKeyCompare(providedKey, key.value)
  );

  if (activeMatch) {
    return { authenticated: true, reason: 'authenticated' as const };
  }

  const hasActiveKeys = configuredNotificationKeys.some((key) => isActiveKey(key, now));

  if (!hasActiveKeys) {
    return { authenticated: false, reason: 'no_active_keys' as const };
  }

  return { authenticated: false, reason: 'auth_failed' as const };
}

const configuredNotificationKeys = loadConfiguredKeys();

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}
const notificationRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  prefix: 'notifications',
});

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
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

function validatePayload(body: any) {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    errors.push('Payload inválido');
    return errors;
  }

  const { walletAddresses, title, message, miniAppPath } = body;

  if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
    errors.push('walletAddresses debe ser un arreglo con al menos una dirección');
  } else {
    if (walletAddresses.length > 50) {
      errors.push('walletAddresses no puede incluir más de 50 direcciones por solicitud');
    }

    const invalidAddresses = walletAddresses.filter((addr) => !isValidWalletAddress(addr));
    if (invalidAddresses.length > 0) {
      errors.push('Algunas direcciones de wallet no son válidas');
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

  if (typeof body.nonce !== 'string' || body.nonce.trim().length < 16 || body.nonce.length > 128) {
    errors.push('nonce es obligatorio y debe tener entre 16 y 128 caracteres');
  }

  return errors;
}

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const providedKey = req.headers.get('x-api-key');
  const resolved = await resolveNotificationApiKey(providedKey);

  return {
    providedKey,
    role: resolved?.role,
    authorized: Boolean(resolved),
  };
}

function logAudit(event: {
function checkRateLimit(apiKey: string) {
  return notificationRateLimiter.limit(apiKey);
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

  // Purge expired nonces opportunistically
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

export async function POST(req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const clientIp = getClientIp(req);
  const providedKey = req.headers.get('x-api-key');
  const authResult = authenticateApiKey(providedKey);

  if (!authResult.authenticated) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, success: false, reason: authResult.reason });
  const origin = req.headers.get('origin');
  const fingerprint = getClientFingerprint(req, clientIp);

  if (!isIpAllowed(clientIp)) {
    logAudit({
      apiKey: providedKey,
      walletCount: 0,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'ip_not_allowed',
    });
    return NextResponse.json({ success: false, message: 'IP no permitida' }, { status: 403 });
  }

  if (!isOriginAllowed(origin)) {
    logAudit({
      apiKey: providedKey,
      walletCount: 0,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'origin_not_allowed',
    });
    return NextResponse.json({ success: false, message: 'Origen no permitido' }, { status: 403 });
  }

  if (!isAuthenticated(req)) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: 'auth_failed' });
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }

  const rate = await rateLimit(`notifications:${providedKey ?? 'missing'}`, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
  });

  if (!rate.allowed) {
  if (!checkRateLimit(providedKey!)) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: 'rate_limited' });
  const authResult = await authenticate(req);
  const providedKey = authResult.providedKey;

  const originCheck = validateSameOrigin(req);

  if (!originCheck.valid) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, success: false, reason: originCheck.reason });
    return NextResponse.json({ success: false, message: 'Solicitud no autorizada' }, { status: 403 });
  }

  if (!isAuthenticated(req)) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, success: false, reason: 'auth_failed' });
    return apiErrorResponse('UNAUTHORIZED', {
      message: 'No autorizado',
      path: 'send-notification',
      details: { reason: 'auth_failed' },
    });
  if (!authResult.authorized || !providedKey) {
    await logAudit({
      apiKey: providedKey,
      role: authResult.role,
      walletCount: 0,
      clientIp,
      success: false,
      reason: 'auth_failed',
    });
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit(providedKey!);
  if (!rateLimitResult.allowed) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, success: false, reason: 'rate_limited' });
    return apiErrorResponse('RATE_LIMITED', {
      message: 'Límite de solicitudes excedido, intente más tarde',
      path: 'send-notification',
    });
  if (!checkRateLimit(providedKey)) {
    await logAudit({
      apiKey: providedKey,
      role: authResult.role,
      walletCount: 0,
      clientIp,
      success: false,
      reason: 'rate_limited',
    });
    return NextResponse.json({ success: false, message: 'Límite de solicitudes excedido, intente más tarde' }, { status: 429 });
  }

  const body = await req.json();
  const validationErrors = validatePayload(body);

  if (validationErrors.length > 0) {
    await logAudit({
      apiKey: providedKey,
      role: authResult.role,
      walletCount: Array.isArray(body?.walletAddresses) ? body.walletAddresses.length : 0,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: `validation_failed:${validationErrors.join('|')}`,
    });
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: validationErrors.join('; '),
      path: 'send-notification',
      details: { validationErrors },
    });
  }

  const { walletAddresses, title, message, miniAppPath } = body;

  const sanitizedTitle = sanitizeText(title);
  const sanitizedMessage = sanitizeText(message);
  const sanitizedMiniAppPath = sanitizeText(miniAppPath);

  if (!sanitizedTitle || !sanitizedMessage || !sanitizedMiniAppPath) {
    logAudit({
      apiKey: providedKey,
      walletCount: Array.isArray(body?.walletAddresses) ? body.walletAddresses.length : 0,
      clientIp,
      success: false,
      reason: 'sanitization_failed',
    });
    return NextResponse.json(
      { success: false, message: 'Los campos title, message y miniAppPath deben contener texto válido' },
      { status: 400 }
  if (!isNonceValid(body.nonce)) {
    logAudit({
      apiKey: providedKey,
      walletCount: walletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'replay_detected',
    });
    return NextResponse.json(
      { success: false, message: 'Solicitud duplicada detectada (nonce reutilizado)' },
      { status: 409 }
    );
  }

  try {
    const response = await fetch('https://developer.worldcoin.org/api/v2/minikit/send-notification', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEV_PORTAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: process.env.APP_ID,
        wallet_addresses: walletAddresses,
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
    });

    const result = await response.json();

    logAudit({
      apiKey: providedKey,
      walletCount: walletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: true,
    await logAudit({ apiKey: providedKey, role: authResult.role, walletCount: walletAddresses.length, clientIp, success: true });

    logApiEvent('info', {
      path: 'send-notification',
      action: 'dispatch',
      walletCount: walletAddresses.length,
      status: response.status,
    });

    return NextResponse.json(result, { status: response.ok ? 200 : response.status });
  } catch (error) {
    logAudit({
      apiKey: providedKey,
      walletCount: walletAddresses.length,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: 'upstream_error',
    });
    logAudit({ apiKey: providedKey, walletCount: walletAddresses.length, clientIp, success: false, reason: 'upstream_error' });
    return apiErrorResponse('UPSTREAM_ERROR', {
      message: 'No se pudo enviar la notificación. Considere enrutar el envío a un servicio backend protegido.',
      path: 'send-notification',
      details: { error: (error as Error)?.message },
    });
    await logAudit({ apiKey: providedKey, role: authResult.role, walletCount: walletAddresses.length, clientIp, success: false, reason: 'upstream_error' });
    console.error('Error enviando notificación al servicio protegido', error);

    return NextResponse.json(
      {
        success: false,
        message: 'No se pudo enviar la notificación. Considere enrutar el envío a un servicio backend protegido.',
      },
      { status: 502 }
    );
  }
}
