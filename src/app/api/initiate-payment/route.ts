import { NextRequest, NextResponse } from 'next/server';
import { createPaymentRecord, findPaymentByReference } from '@/lib/database';
import { SUPPORTED_TOKENS, SupportedToken, resolveTokenFromAddress } from '@/lib/constants';
import { normalizeTokenIdentifier } from '@/lib/tokenNormalization';

export async function POST(req: NextRequest) {
  const { reference, type, token, amount, tournamentId, walletAddress, userId: bodyUserId } = await req.json();
  const userId = req.headers.get('x-user-id') ?? bodyUserId ?? 'anonymous';

  if (!reference || !type) {
    return NextResponse.json(
      { success: false, message: 'Referencia y tipo son obligatorios' },
      { status: 400 }
    );
  }

  if (type !== 'quick_match' && type !== 'tournament') {
    return NextResponse.json(
      { success: false, message: 'Tipo de pago no soportado' },
      { status: 400 }
    );
  }

  if (type === 'tournament' && !tournamentId) {
    return NextResponse.json(
      { success: false, message: 'tournamentId es obligatorio para torneos' },
      { status: 400 }
    );
  }

  const existingPayment = await findPaymentByReference(reference);

  if (existingPayment) {
    return NextResponse.json({ success: true, reference, tournamentId: existingPayment.tournament_id });
  }

  const normalizedToken = token
    ? normalizeTokenIdentifier(token)
    : normalizeTokenIdentifier(SUPPORTED_TOKENS.WLD.address);
  const tokenKey = resolveTokenFromAddress(normalizedToken) as SupportedToken;
  const decimals = SUPPORTED_TOKENS[tokenKey].decimals;
  const tokenAmount = amount !== undefined ? BigInt(Math.round(Number(amount) * 10 ** decimals)).toString() : '0';

  await createPaymentRecord({
    reference,
    type: type === 'tournament' ? 'tournament' : 'quick_match',
    token_address: normalizedToken ?? '',
    token_amount: tokenAmount,
    tournament_id: tournamentId,
    recipient_address: process.env.NEXT_PUBLIC_RECEIVER_ADDRESS,
    user_id: userId,
    wallet_address: walletAddress,
  });

  console.log('Pago iniciado:', { reference, type, token, amount, tournamentId });

  return NextResponse.json({ success: true, reference, tournamentId });
}
