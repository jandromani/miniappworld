import { NextRequest } from 'next/server';
import { createSseResponse } from '@/lib/server/sse';
import { getGlobalLeaderboard } from '@/lib/server/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const interval = Number(searchParams.get('interval') ?? 5000);

  return createSseResponse({
    producer: () => getGlobalLeaderboard(),
    intervalMs: interval,
    signal: req.signal,
  });
}
