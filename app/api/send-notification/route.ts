import { NextResponse } from "next/server";

type NotificationPayload = {
  userId: string;
  message: string;
};

export async function POST(request: Request) {
  const payload: NotificationPayload = await request.json();

  return NextResponse.json({
    delivered: true,
    userId: payload.userId,
    message: payload.message,
  });
}
