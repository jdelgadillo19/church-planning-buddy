import fs from "node:fs/promises";
import path from "node:path";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { googleConnected } from "@/app/api/auth/google/_session";
import {
  MESSAGE_LIBRARY_COLUMNS,
  messagingCalendarId,
  messagingScriptPath,
  messagingSheetId,
} from "@/lib/config/messaging";
import { buildAuthHeader } from "@/lib/pco/client";
import { loadMessageLibrary, pickMessageVariant } from "./message-library";
import type {
  MessagingDeliveryMode,
  MessagingHealthResult,
  MessagingWorkflow,
  HealthCheck,
} from "./types";
import { whatsappCloudConfigured } from "./whatsapp-cloud";

function blocking(id: string, message: string): HealthCheck {
  return { id, severity: "blocking", message };
}

export async function runMessagingHealthCheck(input: {
  tokens: GoogleTokens | null;
  workflow?: MessagingWorkflow;
  group?: string;
  purpose?: string;
  context?: string;
  deliveryMode?: MessagingDeliveryMode;
}): Promise<MessagingHealthResult> {
  const deliveryMode =
    input.deliveryMode ?? input.workflow?.deliveryMode ?? "draft_forward";
  const checks: HealthCheck[] = [];

  if (!googleConnected(input.tokens)) {
    checks.push(blocking("google", "Google is not connected. Reconnect in CPB."));
  }

  if (!messagingSheetId()) {
    checks.push(blocking("sheet_id", "MESSAGING_SHEET_ID is not set in .env.local"));
  }

  if (!messagingCalendarId()) {
    checks.push({
      id: "calendar_id",
      severity: "warning",
      message: "MESSAGING_CALENDAR_ID is not set — calendar sync disabled.",
    });
  }

  const auth = buildAuthHeader();
  if (!auth) {
    checks.push(blocking("pco", "Planning Center auth missing (PCO_BASIC_TOKEN)."));
  }

  const scriptRel = messagingScriptPath();
  const scriptAbs = path.join(process.cwd(), scriptRel);
  try {
    await fs.access(scriptAbs);
  } catch {
    const msg = `WhatsApp sender script not found: ${scriptRel}`;
    if (deliveryMode === "whatsapp_desktop") {
      checks.push(blocking("whatsapp_script", msg));
    } else {
      checks.push({
        id: "whatsapp_script",
        severity: "warning",
        message: `${msg} (not required for draft_forward)`,
      });
    }
  }

  if (deliveryMode === "draft_forward" && !whatsappCloudConfigured()) {
    checks.push({
      id: "draft_channel",
      severity: "warning",
      message:
        "WhatsApp Cloud API not configured — drafts use macOS notification + CPB pending queue. Set WHATSAPP_CLOUD_* for draft-to-your-phone.",
    });
  }

  if (input.tokens && messagingSheetId()) {
    try {
      const { rows, errors } = await loadMessageLibrary(input.tokens);
      if (errors.length > 0) {
        checks.push(blocking("sheet_schema", errors.join("; ")));
      } else if (rows.length === 0) {
        checks.push(blocking("sheet_rows", "Message library has no data rows yet."));
      }

      if (input.workflow && errors.length === 0) {
        const group = input.group ?? input.workflow.targetGroup;
        const purpose = input.purpose ?? input.workflow.purpose;
        const context = input.context ?? "normal";
        const pick = pickMessageVariant(rows, { group, purpose, context });
        if (!pick) {
          checks.push(
            blocking(
              "message_match",
              `No enabled message for Group="${group}", Purpose="${purpose}", Context="${context}".`,
            ),
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to read message sheet";
      checks.push(blocking("sheet_read", msg));
    }
  }

  const hasBlocking = checks.some((c) => c.severity === "blocking");
  return { ok: !hasBlocking, checks };
}

export function formatHealthSummary(result: MessagingHealthResult): string {
  if (result.ok) return "All blocking checks passed.";
  return result.checks
    .filter((c) => c.severity === "blocking")
    .map((c) => c.message)
    .join("\n");
}

export { MESSAGE_LIBRARY_COLUMNS };
