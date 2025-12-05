import { NextResponse } from 'next/server';
import { getMetricsSnapshot, metricsContentType } from '@/lib/metrics';

export async function GET() {
  const snapshot = await getMetricsSnapshot();

  return new NextResponse(snapshot, {
    status: 200,
    headers: {
      'Content-Type': metricsContentType,
      'Cache-Control': 'no-store',
    },
  });
}
