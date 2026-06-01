/** Default Planning Center person (Jesse) — owner context for away messages. */
export const PCO_OWNER_PERSON_ID_DEFAULT = "AC114173152";

export const MESSAGING_SHEET_TAB = "Messages";

export const MESSAGE_LIBRARY_COLUMNS = [
  "Group",
  "Purpose",
  "Context",
  "Variant",
  "Message",
  "Additional",
  "Enabled",
] as const;

export const DEFAULT_KNOWN_GROUPS = [
  "TestGroup",
  "Saddleback Berlin Worship Community",
] as const;

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function messagingSheetId(): string | undefined {
  return env("MESSAGING_SHEET_ID");
}

export function messagingCalendarId(): string | undefined {
  return env("MESSAGING_CALENDAR_ID");
}

export function messagingAlertGroup(): string {
  return env("MESSAGING_ALERT_GROUP") ?? "TestGroup";
}

export function pcoOwnerPersonId(): string {
  return env("PCO_OWNER_PERSON_ID") ?? PCO_OWNER_PERSON_ID_DEFAULT;
}

export function pcoDefaultPlanId(): number | null {
  const raw = env("PCO_DEFAULT_PLAN_ID") ?? "87788328";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function pcoServiceTypeId(): number | null {
  const raw = env("PCO_SERVICE_TYPE_ID");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function stageLayoutPresentationId(): string | undefined {
  return env("STAGE_LAYOUT_PRESENTATION_ID");
}

export function messagingScriptPath(): string {
  return (
    env("MESSAGING_WHATSAPP_SCRIPT") ??
    "scripts/whatsapp/send-message.applescript"
  );
}

export function messagingAllowSendFromEnv(): boolean {
  return env("MESSAGING_ALLOW_SEND") === "true";
}

export function whatsappCloudToken(): string | undefined {
  return env("WHATSAPP_CLOUD_TOKEN");
}

export function whatsappCloudPhoneNumberId(): string | undefined {
  return env("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
}

/** E.164 digits only, e.g. 491701234567 */
export function messagingOwnerPhoneE164(): string | undefined {
  return env("MESSAGING_OWNER_PHONE_E164");
}

/** Optional Pushcut/IFTTT-style webhook for draft delivery */
export function messagingDraftWebhookUrl(): string | undefined {
  return env("MESSAGING_DRAFT_WEBHOOK_URL");
}
