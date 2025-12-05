import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { logApiEvent } from '@/lib/apiError';

export async function GET(_req: NextRequest) {
  const nonce = randomBytes(16).toString('hex');

  logApiEvent('info', { path: 'nonce', action: 'generate', nonce });
  return NextResponse.json({ nonce });
}
