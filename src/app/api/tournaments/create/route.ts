import { NextRequest, NextResponse } from 'next/server';
import { MEMECOIN_CONFIG, USDC_ADDRESS, WLD_ADDRESS } from '@/lib/constants';

const SUPPORTED_ADDRESSES = [
  WLD_ADDRESS.toLowerCase(),
  USDC_ADDRESS.toLowerCase(),
  MEMECOIN_CONFIG.address.toLowerCase(),
];

export async function POST(req: NextRequest) {
  const { name, buyInToken, buyInAmount, maxPlayers, startTime, endTime, acceptedTokens, prizeDistribution } =
    await req.json();

  if (!name || !buyInToken || !buyInAmount || !maxPlayers || !startTime || !endTime || !prizeDistribution) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const normalizedDistribution = Array.isArray(prizeDistribution)
    ? prizeDistribution.map((value: number) => Number(value))
    : [];

  const invalidDistribution =
    !Array.isArray(prizeDistribution) ||
    normalizedDistribution.length === 0 ||
    normalizedDistribution.some((value) => Number.isNaN(value));

  if (invalidDistribution) {
    return NextResponse.json({ error: 'Invalid prize distribution' }, { status: 400 });
  }

  const distributionTotal = normalizedDistribution.reduce((sum, value) => sum + value, 0);
  if (distributionTotal !== 100) {
    return NextResponse.json({ error: 'Prize distribution must add up to 100%' }, { status: 400 });
  }

  const expectedWinners = Number(maxPlayers);
  if (normalizedDistribution.length > expectedWinners) {
    return NextResponse.json({ error: 'Prize distribution exceeds expected winners' }, { status: 400 });
  }

  const lowerBuyIn = String(buyInToken).toLowerCase();
  if (!SUPPORTED_ADDRESSES.includes(lowerBuyIn)) {
    return NextResponse.json({ error: 'Token not supported' }, { status: 400 });
  }

  const normalizedAccepted = (acceptedTokens ?? [buyInToken]).map((token: string) => String(token).toLowerCase());
  const invalid = normalizedAccepted.find((token: string) => !SUPPORTED_ADDRESSES.includes(token));

  if (invalid) {
    return NextResponse.json({ error: 'Token not supported' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    tournament: {
      name,
      buyInToken,
      buyInAmount,
      maxPlayers,
      startTime,
      endTime,
      acceptedTokens,
      prizeDistribution,
    },
  });
}
