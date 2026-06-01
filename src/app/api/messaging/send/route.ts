import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { messagingAllowSendFromEnv } from "@/lib/config/messaging";
import { getWorkflow, loadMessagingConfig, saveMessagingConfig } from "@/lib/messaging/config-store";
import { syncWorkflowCalendarEvent } from "@/lib/messaging/calendar-sync";
import { runMessagingWorkflow } from "@/lib/messaging/run-workflow";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    workflowId?: string;
    group?: string;
    purpose?: string;
    dryRun?: boolean;
    confirmSend?: boolean;
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

  const dryRun = body.dryRun === true;
  const confirmSend = body.confirmSend === true || messagingAllowSendFromEnv();

  const result = await runMessagingWorkflow({
    workflow: { ...workflow },
    tokens,
    dryRun,
    confirmSend,
    groupOverride: body.group,
    purposeOverride: body.purpose,
  });

  if (tokens && workflow.calendarSync) {
    try {
      const eventId = await syncWorkflowCalendarEvent(tokens, workflow, {
        ok: !result.healthBlocked && Boolean(result.sendPlan),
        checks: [],
      });
      if (eventId) {
        workflow.calendarEventId = eventId;
        const idx = config.workflows.findIndex((w) => w.id === workflow.id);
        if (idx >= 0) {
          config.workflows[idx] = { ...workflow, calendarEventId: eventId };
          await saveMessagingConfig(config);
        }
      }
    } catch {
      // ignore calendar sync errors on send response
    }
  }

  return NextResponse.json({ ok: result.ok, result });
}
