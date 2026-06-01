import { NextResponse } from "next/server";
import { loadMessagingConfig, saveMessagingConfig } from "@/lib/messaging/config-store";
import type { MessagingConfig } from "@/lib/messaging/types";

export async function GET() {
  const config = await loadMessagingConfig();
  return NextResponse.json({ ok: true, config });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { config?: MessagingConfig };
  if (!body.config?.workflows || !body.config?.knownGroups) {
    return NextResponse.json({ ok: false, error: "Invalid config body" }, { status: 400 });
  }
  await saveMessagingConfig(body.config);
  return NextResponse.json({ ok: true });
}
