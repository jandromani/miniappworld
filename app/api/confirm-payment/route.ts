import { NextResponse } from "next/server";

type PaymentPayload = {
  reference: string;
  txHash?: string;
  payer?: string;
};

export async function POST(request: Request) {
  const payload: PaymentPayload = await request.json();
  const ok = Boolean(payload.reference && payload.txHash);

  return NextResponse.json({
    ok,
    reference: payload.reference,
    txHash: payload.txHash,
    receivedFrom: payload.payer,
  });
}
