import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, logApiEvent } from '@/lib/apiError';
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
    return apiErrorResponse('INVALID_PAYLOAD', {
      message: 'Missing required fields',
      path: 'tournaments/create',
    });
  }

  const lowerBuyIn = String(buyInToken).toLowerCase();
  if (!SUPPORTED_ADDRESSES.includes(lowerBuyIn)) {
    return apiErrorResponse('UNSUPPORTED_TOKEN', {
      message: 'Token not supported',
      details: { buyInToken },
      path: 'tournaments/create',
    });
  }

  const normalizedAccepted = (acceptedTokens ?? [buyInToken]).map((token: string) => String(token).toLowerCase());
  const invalid = normalizedAccepted.find((token: string) => !SUPPORTED_ADDRESSES.includes(token));

  if (invalid) {
    return apiErrorResponse('UNSUPPORTED_TOKEN', {
      message: 'Token not supported',
      details: { token: invalid },
      path: 'tournaments/create',
    });
  }

  logApiEvent('info', {
    path: 'tournaments/create',
    action: 'create',
    tournamentName: name,
    buyInToken,
    maxPlayers,
  });

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
