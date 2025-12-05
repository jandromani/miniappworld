import { NextResponse } from 'next/server';
import { getGlobalLeaderboard } from '@/lib/server/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getGlobalLeaderboard();
  return NextResponse.json(data);
}
