import { NextResponse } from 'next/server';

const REQUIRED_ENV_VARS = ['APP_ID', 'DEV_PORTAL_API_KEY'] as const;

export function validateCriticalEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

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
