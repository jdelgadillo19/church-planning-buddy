import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { messagingAlertGroup } from "@/lib/config/messaging";
import { appendMessagingLog } from "./logs";
import { buildSendPlanForWorkflow } from "./build-send-plan";
import { syncWorkflowCalendarEvent } from "./calendar-sync";
import { deliverDraftToOwner } from "./deliver-draft";
import { probeGuiSession } from "./gui-session";
import { runMessagingHealthCheck, formatHealthSummary } from "./health";
import { sendMacOsNotification } from "./macos-notify";
import { savePendingDraft } from "./pending-drafts";
import type { MessagingDeliveryMode, MessagingWorkflow, SendResult } from "./types";
import { sendViaWhatsappAppleScript } from "./whatsapp-sender";

export type RunWorkflowOptions = {
  workflow: MessagingWorkflow;
  tokens: GoogleTokens | null;
  dryRun?: boolean;
  confirmSend?: boolean;
  groupOverride?: string;
  purposeOverride?: string;
};

function deliveryMode(workflow: MessagingWorkflow): MessagingDeliveryMode {
  return workflow.deliveryMode ?? "draft_forward";
}

export async function runMessagingWorkflow(
  options: RunWorkflowOptions,
): Promise<SendResult & { healthBlocked?: boolean; notified?: boolean }> {
  const { workflow, tokens, dryRun = false, confirmSend = false } = options;
  const mode = deliveryMode(workflow);

  const health = await runMessagingHealthCheck({
    tokens,
    workflow,
    group: options.groupOverride,
    purpose: options.purposeOverride,
    deliveryMode: mode,
  });

  if (tokens && workflow.calendarSync) {
    try {
      const eventId = await syncWorkflowCalendarEvent(tokens, workflow, health);
      if (eventId) workflow.calendarEventId = eventId;
    } catch {
      // non-blocking
    }
  }

  if (!health.ok) {
    const summary = formatHealthSummary(health);
    await notifyOperator(summary, { deliveryMode: mode, useWhatsappDesktop: false });
    return {
      ok: false,
      dryRun,
      error: summary,
      healthBlocked: true,
      notified: true,
    };
  }

  if (!tokens) {
    return { ok: false, dryRun, error: "Google not connected." };
  }

  let sendPlan;
  try {
    sendPlan = await buildSendPlanForWorkflow(workflow, tokens, {
      group: options.groupOverride,
      purpose: options.purposeOverride,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build send plan";
    await notifyOperator(`CPB blocked: ${workflow.name}\n\n${msg}`, {
      deliveryMode: mode,
      useWhatsappDesktop: false,
    });
    return { ok: false, dryRun, error: msg, notified: true };
  }

  if (dryRun) {
    return { ok: true, dryRun: true, sendPlan };
  }

  if (mode === "draft_forward") {
    return runDraftForwardPath(workflow, sendPlan, { confirmSend });
  }

  return runWhatsappDesktopPath(workflow, sendPlan, { confirmSend, dryRun });
}

async function runDraftForwardPath(
  workflow: MessagingWorkflow,
  sendPlan: NonNullable<SendResult["sendPlan"]>,
  opts: { confirmSend: boolean },
): Promise<SendResult & { notified?: boolean }> {
  if (opts.confirmSend) {
    const gui = await probeGuiSession();
    if (!gui.whatsappDesktopViable) {
      const msg =
        "Cannot post via WhatsApp Desktop — no usable GUI session. Forward the pending draft manually.";
      await notifyOperator(msg, { deliveryMode: "draft_forward", useWhatsappDesktop: false });
      return { ok: false, dryRun: false, sendPlan, error: msg };
    }

    const result = await sendViaWhatsappAppleScript({
      group: sendPlan.group,
      message: sendPlan.message,
      doSend: true,
    });

    await appendMessagingLog({
      workflowId: workflow.id,
      status: result.ok ? "sent" : "failed",
      group: sendPlan.group,
      purpose: sendPlan.purpose,
      context: String(sendPlan.context),
      variant: sendPlan.variant,
      error: result.ok ? undefined : result.stderr || result.stdout,
    });

    if (!result.ok) {
      return {
        ok: false,
        dryRun: false,
        sendPlan,
        error: result.stderr || "WhatsApp Desktop send failed",
      };
    }

    return { ok: true, dryRun: false, sendPlan };
  }

  const delivery = await deliverDraftToOwner({
    sendPlan,
    workflowName: workflow.name,
  });

  const draft = await savePendingDraft({
    workflowId: workflow.id,
    workflowName: workflow.name,
    sendPlan,
    deliveryChannels: delivery.channels,
    deliveryErrors: delivery.errors.length > 0 ? delivery.errors : undefined,
  });

  await appendMessagingLog({
    workflowId: workflow.id,
    status: "preview",
    group: sendPlan.group,
    purpose: sendPlan.purpose,
    context: String(sendPlan.context),
    variant: sendPlan.variant,
  });

  return {
    ok: true,
    dryRun: false,
    sendPlan,
    awaitingForward: true,
    pendingDraftId: draft.id,
    deliveryChannels: delivery.channels,
  };
}

async function runWhatsappDesktopPath(
  workflow: MessagingWorkflow,
  sendPlan: NonNullable<SendResult["sendPlan"]>,
  opts: { confirmSend: boolean; dryRun: boolean },
): Promise<SendResult & { notified?: boolean }> {
  const gui = await probeGuiSession();

  if (workflow.mode === "ask_before_run" && !opts.confirmSend) {
    const preview = [
      `CPB ready to send: ${workflow.name}`,
      `Group: ${sendPlan.group}`,
      `Context: ${sendPlan.context} (${sendPlan.variant})`,
      "",
      sendPlan.message,
      "",
      "Confirm in CPB or: npm run messaging:run -- --workflow … --confirm",
    ].join("\n");

    if (gui.whatsappDesktopViable) {
      await sendViaWhatsappAppleScript({
        group: messagingAlertGroup(),
        message: preview.slice(0, 4000),
        doSend: true,
      });
    } else {
      await notifyOperator(preview, {
        deliveryMode: "whatsapp_desktop",
        useWhatsappDesktop: false,
      });
    }

    return {
      ok: true,
      dryRun: false,
      sendPlan,
      error: "Awaiting confirmation (ask_before_run).",
    };
  }

  if (!gui.whatsappDesktopViable) {
    const msg = "No usable GUI session for WhatsApp Desktop send.";
    await notifyOperator(msg, { deliveryMode: "whatsapp_desktop", useWhatsappDesktop: false });
    return { ok: false, dryRun: false, sendPlan, error: msg };
  }

  const result = await sendViaWhatsappAppleScript({
    group: sendPlan.group,
    message: sendPlan.message,
    doSend: true,
  });

  await appendMessagingLog({
    workflowId: workflow.id,
    status: result.ok ? "sent" : "failed",
    group: sendPlan.group,
    purpose: sendPlan.purpose,
    context: String(sendPlan.context),
    variant: sendPlan.variant,
    error: result.ok ? undefined : result.stderr || result.stdout,
  });

  if (!result.ok) {
    await notifyOperator(
      `CPB send failed: ${workflow.name}\n\n${result.stderr || result.stdout}`,
      { deliveryMode: "whatsapp_desktop", useWhatsappDesktop: gui.whatsappDesktopViable },
    );
    return { ok: false, dryRun: false, sendPlan, error: result.stderr || "WhatsApp send failed" };
  }

  return { ok: true, dryRun: false, sendPlan };
}

async function notifyOperator(
  message: string,
  opts: { deliveryMode: MessagingDeliveryMode; useWhatsappDesktop: boolean },
): Promise<void> {
  await sendMacOsNotification({
    title: "Church Planning Buddy",
    message: message.slice(0, 500),
  });

  if (opts.deliveryMode === "whatsapp_desktop" && opts.useWhatsappDesktop) {
    await sendViaWhatsappAppleScript({
      group: messagingAlertGroup(),
      message: message.slice(0, 4000),
      doSend: true,
    });
  }
}
