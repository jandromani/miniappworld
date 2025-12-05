import { NextResponse } from 'next/server';

const REQUIRED_ENV_VARS = [
  'APP_ID',
  'DEV_PORTAL_API_KEY',
  'NEXT_PUBLIC_APP_ID',
  'NEXT_PUBLIC_DEV_PORTAL_API_KEY',
  'NEXT_PUBLIC_RECEIVER_ADDRESS',
  'NEXT_PUBLIC_ACTION',
] as const;

export function validateCriticalEnvVars() {
  const missing: string[] = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (!process.env.NOTIFICATIONS_API_KEY && !process.env.NOTIFICATIONS_API_KEYS) {
    missing.push('NOTIFICATIONS_API_KEY o NOTIFICATIONS_API_KEYS');
  }

  if (missing.length > 0) {
    console.error('[config] Variables de entorno críticas faltantes', { missing });
    return NextResponse.json(
      {
        success: false,
        message: `Faltan variables de entorno requeridas: ${missing.join(', ')}`,
      },
      { status: 500 }
    );
  }

  return null;
}
