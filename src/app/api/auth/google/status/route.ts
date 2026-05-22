import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "../_session";

export async function GET() {
  const tokens = await loadTokensForCurrentSession();
  return NextResponse.json({
    ok: true,
    connected: googleConnected(tokens),
    scopes: tokens?.scope?.split(" ") ?? [],
  });
}
