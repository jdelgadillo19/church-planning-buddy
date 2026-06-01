import { NextResponse } from "next/server";
import { loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getWorkflow, loadMessagingConfig } from "@/lib/messaging/config-store";
import { runMessagingHealthCheck } from "@/lib/messaging/health";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    workflowId?: string;
    group?: string;
    purpose?: string;
    context?: string;
  };

  const tokens = await loadTokensForCurrentSession();
  const config = await loadMessagingConfig();
  const workflow = body.workflowId ? getWorkflow(config, body.workflowId) : undefined;

  const health = await runMessagingHealthCheck({
    tokens,
    workflow,
    group: body.group,
    purpose: body.purpose,
    context: body.context,
  });

  return NextResponse.json({ ok: true, health });
}
