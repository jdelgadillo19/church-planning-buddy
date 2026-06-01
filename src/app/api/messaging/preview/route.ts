import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getWorkflow, loadMessagingConfig } from "@/lib/messaging/config-store";
import { buildSendPlanForWorkflow } from "@/lib/messaging/build-send-plan";
import { runMessagingHealthCheck } from "@/lib/messaging/health";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    workflowId?: string;
    group?: string;
    purpose?: string;
  };

  const tokens = await loadTokensForCurrentSession();
  if (!googleConnected(tokens)) {
    return NextResponse.json({ ok: false, error: "Google not connected" }, { status: 401 });
  }

  const config = await loadMessagingConfig();
  const workflowId = body.workflowId ?? config.workflows[0]?.id;
  if (!workflowId) {
    return NextResponse.json({ ok: false, error: "No workflow configured" }, { status: 400 });
  }

  const workflow = getWorkflow(config, workflowId);
  if (!workflow) {
    return NextResponse.json({ ok: false, error: `Unknown workflow: ${workflowId}` }, { status: 404 });
  }

  const health = await runMessagingHealthCheck({
    tokens,
    workflow,
    group: body.group,
    purpose: body.purpose,
  });

  if (!health.ok) {
    return NextResponse.json({ ok: false, health, error: "Health check failed" }, { status: 422 });
  }

  try {
    const sendPlan = await buildSendPlanForWorkflow(workflow, tokens!, {
      group: body.group,
      purpose: body.purpose,
    });
    return NextResponse.json({ ok: true, health, sendPlan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ ok: false, health, error: msg }, { status: 422 });
  }
}
