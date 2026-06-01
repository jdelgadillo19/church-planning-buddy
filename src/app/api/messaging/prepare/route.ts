import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getWorkflow, loadMessagingConfig } from "@/lib/messaging/config-store";
import { runMessagingWorkflow } from "@/lib/messaging/run-workflow";

/** Headless-safe: build message, queue pending draft, deliver to owner (no group post). */
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

  const result = await runMessagingWorkflow({
    workflow: { ...workflow, deliveryMode: workflow.deliveryMode ?? "draft_forward" },
    tokens,
    dryRun: false,
    confirmSend: false,
    groupOverride: body.group,
    purposeOverride: body.purpose,
  });

  return NextResponse.json({ ok: result.ok, result });
}
