import { NextResponse } from "next/server";
import { readRecentMessagingLogs } from "@/lib/messaging/logs";

export async function GET() {
  const logs = await readRecentMessagingLogs(30);
  return NextResponse.json({ ok: true, logs });
}
