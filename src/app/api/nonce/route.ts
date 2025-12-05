import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { validateCriticalEnvVars } from '@/lib/envValidation';

export async function GET(_req: NextRequest) {
  const envError = validateCriticalEnvVars();
  if (envError) {
    return envError;
  }

  const nonce = randomBytes(16).toString('hex');
  return NextResponse.json({ nonce });
}
