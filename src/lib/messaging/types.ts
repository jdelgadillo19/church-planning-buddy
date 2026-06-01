export type MessagingRunMode = "ask_before_run" | "auto_run_then_notify";

/**
 * draft_forward — schedule builds message, delivers draft to you; you forward to the group.
 * whatsapp_desktop — legacy AppleScript post to group (requires GUI session).
 */
export type MessagingDeliveryMode = "draft_forward" | "whatsapp_desktop";

export type MessagingContext = "normal" | "away" | string;

export type MessageLibraryRow = {
  group: string;
  purpose: string;
  context: string;
  variant: string;
  message: string;
  additional: string;
  enabled: boolean;
};

export type MessagingWorkflowSchedule = {
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
};

export type MessagingWorkflow = {
  id: string;
  name: string;
  enabled: boolean;
  targetGroup: string;
  purpose: string;
  schedule: MessagingWorkflowSchedule;
  mode: MessagingRunMode;
  /** Default: draft_forward (Codex compromise — headless prepare, human forward). */
  deliveryMode?: MessagingDeliveryMode;
  calendarSync: boolean;
  calendarEventId?: string;
};

export type MessagingConfig = {
  knownGroups: string[];
  workflows: MessagingWorkflow[];
};

export type HealthSeverity = "blocking" | "warning" | "info";

export type HealthCheck = {
  id: string;
  severity: HealthSeverity;
  message: string;
};

export type MessagingHealthResult = {
  ok: boolean;
  checks: HealthCheck[];
};

export type SendPlan = {
  workflowId: string;
  group: string;
  purpose: string;
  context: MessagingContext;
  variant: string;
  message: string;
  planId?: number;
  planDate?: string;
};

export type SendResult = {
  ok: boolean;
  dryRun: boolean;
  error?: string;
  sendPlan?: SendPlan;
  /** draft_forward: draft queued for manual forward */
  awaitingForward?: boolean;
  pendingDraftId?: string;
  deliveryChannels?: string[];
};
