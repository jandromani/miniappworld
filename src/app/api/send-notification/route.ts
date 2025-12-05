import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

type RateLimitEntry = {
  windowStart: number;
  count: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const NONCE_TTL_MS = 5 * 60_000;

const rateLimitByKey = new Map<string, RateLimitEntry>();
const nonceCache = new Map<string, number>();

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

function isAuthenticated(req: NextRequest) {
  const configuredKey = process.env.NOTIFICATIONS_API_KEY;
  const providedKey = req.headers.get('x-api-key');

  if (!configuredKey || !providedKey) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(configuredKey));
  } catch (error) {
    return false;
  }
}

function checkRateLimit(apiKey: string) {
  const now = Date.now();
  const current = rateLimitByKey.get(apiKey);

  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitByKey.set(apiKey, { windowStart: now, count: 1 });
    return true;
  }

  if (current.count < RATE_LIMIT_MAX_REQUESTS) {
    rateLimitByKey.set(apiKey, { ...current, count: current.count + 1 });
    return true;
  }

  return false;
}

function logAudit(event: {
  apiKey?: string | null;
  walletCount?: number;
  clientIp?: string;
  origin?: string | null;
  fingerprint?: string;
  success: boolean;
  reason?: string;
}) {
  const apiKeyHash = event.apiKey ? hashKey(event.apiKey) : 'missing';
  const timestamp = new Date().toISOString();

  console.log('[notification_audit]', {
    timestamp,
    apiKeyHash,
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
  const clientIp = getClientIp(req);
  const providedKey = req.headers.get('x-api-key');
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

  if (!checkRateLimit(providedKey!)) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, origin, fingerprint, success: false, reason: 'rate_limited' });
    return NextResponse.json({ success: false, message: 'Límite de solicitudes excedido, intente más tarde' }, { status: 429 });
  }

  const body = await req.json();
  const validationErrors = validatePayload(body);

  if (validationErrors.length > 0) {
    logAudit({
      apiKey: providedKey,
      walletCount: Array.isArray(body?.walletAddresses) ? body.walletAddresses.length : 0,
      clientIp,
      origin,
      fingerprint,
      success: false,
      reason: `validation_failed:${validationErrors.join('|')}`,
    });
    return NextResponse.json({ success: false, message: validationErrors.join('; ') }, { status: 400 });
  }

  const { walletAddresses, title, message, miniAppPath } = body;

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
            title,
            message,
          },
          {
            language: 'es',
            title,
            message,
          },
        ],
        mini_app_path: miniAppPath,
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
