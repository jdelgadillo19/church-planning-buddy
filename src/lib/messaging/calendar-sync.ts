import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { messagingCalendarId } from "@/lib/config/messaging";
import { getAuthedClients } from "@/lib/google/auth";
import type { MessagingHealthResult, MessagingWorkflow } from "./types";

const CPB_EXTENDED_PROP = "cpbWorkflowId";

function eventTitle(workflow: MessagingWorkflow, health?: MessagingHealthResult): string {
  const prefix = health && !health.ok ? "[BROKEN] " : "[CPB] ";
  return `${prefix}${workflow.name}`;
}

function scheduleDescription(workflow: MessagingWorkflow): string {
  const s = workflow.schedule;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `Workflow ${workflow.id}\nGroup: ${workflow.targetGroup}\nPurpose: ${workflow.purpose}\nSchedule: ${days[s.dayOfWeek] ?? "?"} ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")} (${s.timezone})\nMode: ${workflow.mode}`;
}

function nextOccurrenceRfc3339(workflow: MessagingWorkflow): string {
  const { dayOfWeek, hour, minute, timezone } = workflow.schedule;
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const currentDow = new Date(
    `${get("year")}-${get("month")}-${get("day")}T12:00:00`,
  ).getDay();
  let delta = (dayOfWeek - currentDow + 7) % 7;
  const localH = Number.parseInt(get("hour"), 10);
  const localM = Number.parseInt(get("minute"), 10);
  if (delta === 0 && (localH > hour || (localH === hour && localM >= minute))) {
    delta = 7;
  }

  const target = new Date(now.getTime() + delta * 24 * 60 * 60 * 1000);
  const y = target.getFullYear();
  const mo = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${y}-${mo}-${d}T${hh}:${mm}:00`;
}

export async function syncWorkflowCalendarEvent(
  tokens: GoogleTokens,
  workflow: MessagingWorkflow,
  health?: MessagingHealthResult,
): Promise<string | undefined> {
  if (!workflow.calendarSync) return workflow.calendarEventId;
  const calendarId = messagingCalendarId();
  if (!calendarId) return undefined;

  const { calendar } = getAuthedClients(tokens);
  const start = nextOccurrenceRfc3339(workflow);
  const endDate = new Date(`${start}`);
  endDate.setMinutes(endDate.getMinutes() + 15);
  const end = endDate.toISOString().slice(0, 19);

  const body = {
    summary: eventTitle(workflow, health),
    description: scheduleDescription(workflow),
    start: { dateTime: start, timeZone: workflow.schedule.timezone },
    end: {
      dateTime: end,
      timeZone: workflow.schedule.timezone,
    },
    extendedProperties: {
      private: {
        [CPB_EXTENDED_PROP]: workflow.id,
        cpbHealth: health?.ok ? "healthy" : "broken",
      },
    },
  };

  if (workflow.calendarEventId) {
    const updated = await calendar.events.patch({
      calendarId,
      eventId: workflow.calendarEventId,
      requestBody: body,
    });
    return updated.data.id ?? workflow.calendarEventId;
  }

  const created = await calendar.events.insert({
    calendarId,
    requestBody: body,
  });
  return created.data.id ?? undefined;
}
