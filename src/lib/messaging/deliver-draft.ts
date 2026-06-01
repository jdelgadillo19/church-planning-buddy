import { messagingDraftWebhookUrl } from "@/lib/config/messaging";
import { sendMacOsNotification } from "./macos-notify";
import { formatDraftForOwner } from "./pending-drafts";
import type { SendPlan } from "./types";
import { sendWhatsappCloudTextToOwner, whatsappCloudConfigured } from "./whatsapp-cloud";

export type DraftDeliveryResult = {
  channels: string[];
  errors: string[];
};

/** Headless delivery of prepared draft to owner (no group post). */
export async function deliverDraftToOwner(input: {
  sendPlan: SendPlan;
  workflowName: string;
}): Promise<DraftDeliveryResult> {
  const body = formatDraftForOwner(input.sendPlan, input.workflowName);
  const channels: string[] = [];
  const errors: string[] = [];

  if (whatsappCloudConfigured()) {
    const cloud = await sendWhatsappCloudTextToOwner(body);
    if (cloud.ok) channels.push("whatsapp_cloud");
    else if (cloud.error) errors.push(`whatsapp_cloud: ${cloud.error}`);
  }

  const webhook = messagingDraftWebhookUrl();
  if (webhook) {
    const hook = await postDraftWebhook(webhook, input.workflowName, body, input.sendPlan);
    if (hook.ok) channels.push("webhook");
    else if (hook.error) errors.push(`webhook: ${hook.error}`);
  }

  const notify = await sendMacOsNotification({
    title: `CPB: ${input.workflowName}`,
    message: `Forward to "${input.sendPlan.group}". Open CPB Messaging for full text.`,
  });
  if (notify.ok) channels.push("macos_notification");
  else if (notify.error) errors.push(`macos_notification: ${notify.error}`);

  channels.push("cpb_pending_file");

  return { channels, errors };
}

async function postDraftWebhook(
  url: string,
  workflowName: string,
  body: string,
  sendPlan: SendPlan,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `CPB draft: ${workflowName}`,
        body,
        forwardTo: sendPlan.group,
        context: sendPlan.context,
        variant: sendPlan.variant,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Webhook HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Webhook failed" };
  }
}
