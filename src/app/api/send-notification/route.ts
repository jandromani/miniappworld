import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { walletAddresses, title, message, miniAppPath } = await req.json();

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
  return NextResponse.json(result);
}
