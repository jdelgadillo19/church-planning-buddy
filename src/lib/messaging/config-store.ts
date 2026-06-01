import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_KNOWN_GROUPS } from "@/lib/config/messaging";
import type { MessagingConfig, MessagingWorkflow } from "./types";

const CONFIG_PATH = path.join(process.cwd(), ".data", "messaging-config.json");

const DEFAULT_WORKFLOWS: MessagingWorkflow[] = [
  {
    id: "saddleback-signup-reminder",
    name: "Signup reminder (announcements)",
    enabled: true,
    targetGroup: "Saddleback Berlin Worship Community",
    purpose: "Signup Reminder",
    schedule: {
      dayOfWeek: 4,
      hour: 8,
      minute: 0,
      timezone: "Europe/Berlin",
    },
    mode: "ask_before_run",
    deliveryMode: "draft_forward",
    calendarSync: true,
  },
];

function defaultConfig(): MessagingConfig {
  return {
    knownGroups: [...DEFAULT_KNOWN_GROUPS],
    workflows: DEFAULT_WORKFLOWS.map((w) => ({ ...w })),
  };
}

function mergeConfig(partial: Partial<MessagingConfig> | null): MessagingConfig {
  const base = defaultConfig();
  if (!partial) return base;

  const knownGroups = Array.from(
    new Set([...base.knownGroups, ...(partial.knownGroups ?? [])].filter(Boolean)),
  );

  const workflowsById = new Map<string, MessagingWorkflow>();
  for (const w of base.workflows) workflowsById.set(w.id, { ...w });
  for (const w of partial.workflows ?? []) {
    const existing = workflowsById.get(w.id);
    workflowsById.set(w.id, existing ? { ...existing, ...w } : { ...w });
  }

  return {
    knownGroups,
    workflows: [...workflowsById.values()],
  };
}

export async function loadMessagingConfig(): Promise<MessagingConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return mergeConfig(JSON.parse(raw) as Partial<MessagingConfig>);
  } catch {
    return defaultConfig();
  }
}

export async function saveMessagingConfig(config: MessagingConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function getWorkflow(config: MessagingConfig, workflowId: string): MessagingWorkflow | undefined {
  return config.workflows.find((w) => w.id === workflowId);
}
