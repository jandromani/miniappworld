import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  const body = await request.json();
  const reference = body.reference ?? randomUUID();
  const amount = body.amount ?? "1000000000000000000"; // 1 WLD

  return NextResponse.json({
    reference,
    amount,
    description: "Tournament entry",
    to: body.to ?? process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  });
}
