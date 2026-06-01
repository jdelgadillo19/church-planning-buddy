/**
 * Local workflow runner for launchd / manual use on the messaging Mac.
 *
 * Usage:
 *   npx tsx scripts/messaging-run.ts --workflow saddleback-signup-reminder
 *   npx tsx scripts/messaging-run.ts --workflow saddleback-signup-reminder --confirm
 *   npx tsx scripts/messaging-run.ts --workflow saddleback-signup-reminder --dry-run
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { loadAnyStoredGoogleTokens } from "../src/app/api/auth/google/_session";
import { getWorkflow, loadMessagingConfig, saveMessagingConfig } from "../src/lib/messaging/config-store";
import { syncWorkflowCalendarEvent } from "../src/lib/messaging/calendar-sync";
import { runMessagingWorkflow } from "../src/lib/messaging/run-workflow";
import { runMessagingHealthCheck } from "../src/lib/messaging/health";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const workflowId = arg("--workflow");
  if (!workflowId) {
    console.error("Missing --workflow <id>");
    process.exit(1);
  }

  const config = await loadMessagingConfig();
  const workflow = getWorkflow(config, workflowId);
  if (!workflow) {
    console.error(`Unknown workflow: ${workflowId}`);
    process.exit(1);
  }

  if (!workflow.enabled) {
    console.log(`Workflow ${workflowId} is disabled.`);
    process.exit(0);
  }

  const tokens = await loadAnyStoredGoogleTokens();
  const dryRun = hasFlag("--dry-run");
  const confirmSend = hasFlag("--confirm");

  const deliveryMode = workflow.deliveryMode ?? "draft_forward";
  const health = await runMessagingHealthCheck({ tokens, workflow, deliveryMode });
  if (tokens && workflow.calendarSync) {
    try {
      const eventId = await syncWorkflowCalendarEvent(tokens, workflow, health);
      if (eventId && eventId !== workflow.calendarEventId) {
        workflow.calendarEventId = eventId;
        const idx = config.workflows.findIndex((w) => w.id === workflow.id);
        if (idx >= 0) {
          config.workflows[idx] = { ...workflow };
          await saveMessagingConfig(config);
        }
      }
    } catch (e) {
      console.warn("Calendar sync warning:", e instanceof Error ? e.message : e);
    }
  }

  const effectiveConfirm =
    confirmSend || (deliveryMode === "whatsapp_desktop" && process.env.MESSAGING_ALLOW_SEND === "true");

  const result = await runMessagingWorkflow({
    workflow: { ...workflow, deliveryMode },
    tokens,
    dryRun,
    confirmSend: effectiveConfirm,
  });

  console.log(JSON.stringify(result, null, 2));
  const exitOk =
    result.ok &&
    !result.healthBlocked &&
    (!result.awaitingForward || deliveryMode === "draft_forward");
  process.exit(exitOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
