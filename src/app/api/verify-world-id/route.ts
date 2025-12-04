import { NextRequest, NextResponse } from 'next/server';
import { verifyCloudProof } from '@worldcoin/minikit-js';

export async function POST(req: NextRequest) {
  const { proof, nullifier_hash, merkle_root } = await req.json();

  const verifyRes = await verifyCloudProof(
    { proof, nullifier_hash, merkle_root, verification_level: 'orb' },
    process.env.APP_ID as `app_${string}`,
    'trivia_game_access'
  );

  if (verifyRes.success) {
    // TODO: Guardar nullifier_hash en DB como userId único
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 400 });
}
