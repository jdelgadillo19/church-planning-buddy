import { NextResponse } from "next/server";
import { listPendingDrafts } from "@/lib/messaging/pending-drafts";

export async function GET() {
  const drafts = await listPendingDrafts();
  return NextResponse.json({ ok: true, drafts });
}
