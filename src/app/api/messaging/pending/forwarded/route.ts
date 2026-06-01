import { NextResponse } from "next/server";
import { markPendingDraftForwarded } from "@/lib/messaging/pending-drafts";

export async function POST(req: Request) {
  const body = (await req.json()) as { workflowId?: string };
  if (!body.workflowId?.trim()) {
    return NextResponse.json({ ok: false, error: "workflowId required" }, { status: 400 });
  }

  const draft = await markPendingDraftForwarded(body.workflowId.trim());
  if (!draft) {
    return NextResponse.json({ ok: false, error: "No pending draft found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, draft });
}
