import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

type NotificationApiKey = {
  value: string;
  expiresAt?: Date;
};

type RateLimitEntry = {
  windowStart: number;
  count: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const rateLimitByKey = new Map<string, RateLimitEntry>();

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

  return errors;
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
    success: event.success,
    reason: event.reason,
  });
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const providedKey = req.headers.get('x-api-key');
  const authResult = authenticateApiKey(providedKey);

  if (!authResult.authenticated) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, success: false, reason: authResult.reason });
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }

  if (!checkRateLimit(providedKey!)) {
    logAudit({ apiKey: providedKey, walletCount: 0, clientIp, success: false, reason: 'rate_limited' });
    return NextResponse.json({ success: false, message: 'Límite de solicitudes excedido, intente más tarde' }, { status: 429 });
  }

  const body = await req.json();
  const validationErrors = validatePayload(body);

  if (validationErrors.length > 0) {
    logAudit({
      apiKey: providedKey,
      walletCount: Array.isArray(body?.walletAddresses) ? body.walletAddresses.length : 0,
      clientIp,
      success: false,
      reason: `validation_failed:${validationErrors.join('|')}`,
    });
    return NextResponse.json({ success: false, message: validationErrors.join('; ') }, { status: 400 });
  }

  const { walletAddresses, title, message, miniAppPath } = body;

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

    logAudit({ apiKey: providedKey, walletCount: walletAddresses.length, clientIp, success: true });

    return NextResponse.json(result, { status: response.ok ? 200 : response.status });
  } catch (error) {
    logAudit({ apiKey: providedKey, walletCount: walletAddresses.length, clientIp, success: false, reason: 'upstream_error' });
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
