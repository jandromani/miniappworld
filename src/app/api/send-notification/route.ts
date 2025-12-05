import { NextRequest, NextResponse } from 'next/server';
import { validateCriticalEnvVars } from '@/lib/envValidation';
import { appendNotificationAuditEvent } from '@/lib/notificationAuditLog';
import { hashNotificationApiKey, resolveNotificationApiKey } from '@/lib/notificationApiKeys';

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

const rateLimitByKey = new Map<string, RateLimitEntry>();

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

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const providedKey = req.headers.get('x-api-key');
  const resolved = await resolveNotificationApiKey(providedKey);

  return {
    providedKey,
    role: resolved?.role,
    authorized: Boolean(resolved),
  };
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

async function logAudit(event: {
  apiKey?: string | null;
  role?: string;
  walletCount?: number;
  clientIp?: string;
  success: boolean;
  reason?: string;
}) {
  const apiKeyHash = event.apiKey ? hashNotificationApiKey(event.apiKey) : 'missing';
  const timestamp = new Date().toISOString();

  await appendNotificationAuditEvent({
    timestamp,
    apiKeyHash,
    role: event.role,
    walletCount: event.walletCount,
    clientIp: event.clientIp,
    success: event.success,
    reason: event.reason,
  });
}

export async function POST(req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const clientIp = getClientIp(req);
  const authResult = await authenticate(req);
  const providedKey = authResult.providedKey;

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

    await logAudit({ apiKey: providedKey, role: authResult.role, walletCount: walletAddresses.length, clientIp, success: true });

    return NextResponse.json(result, { status: response.ok ? 200 : response.status });
  } catch (error) {
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
