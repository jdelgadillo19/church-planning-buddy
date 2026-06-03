import { NextResponse } from "next/server";
import { clearTokensForCurrentSession } from "../_session";

export async function POST() {
  await clearTokensForCurrentSession();
  return NextResponse.json({ ok: true, connected: false });
}
