import fs from "node:fs/promises";
import path from "node:path";
import type { SendPlan } from "./types";

export type PendingDraftStatus = "ready" | "forwarded" | "cancelled";

export type PendingDraft = {
  id: string;
  workflowId: string;
  workflowName: string;
  createdAt: string;
  status: PendingDraftStatus;
  sendPlan: SendPlan;
  deliveryChannels: string[];
  deliveryErrors?: string[];
};

const PENDING_DIR = path.join(process.cwd(), ".data", "messaging-pending");

function draftPath(workflowId: string): string {
  return path.join(PENDING_DIR, `${workflowId}.json`);
}

export async function savePendingDraft(input: {
  workflowId: string;
  workflowName: string;
  sendPlan: SendPlan;
  deliveryChannels: string[];
  deliveryErrors?: string[];
}): Promise<PendingDraft> {
  await fs.mkdir(PENDING_DIR, { recursive: true });
  const draft: PendingDraft = {
    id: `${input.workflowId}-${Date.now()}`,
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    createdAt: new Date().toISOString(),
    status: "ready",
    sendPlan: input.sendPlan,
    deliveryChannels: input.deliveryChannels,
    deliveryErrors: input.deliveryErrors,
  };
  await fs.writeFile(draftPath(input.workflowId), JSON.stringify(draft, null, 2), "utf8");
  return draft;
}

export async function loadPendingDraft(workflowId: string): Promise<PendingDraft | null> {
  try {
    const raw = await fs.readFile(draftPath(workflowId), "utf8");
    return JSON.parse(raw) as PendingDraft;
  } catch {
    return null;
  }
}

export async function listPendingDrafts(): Promise<PendingDraft[]> {
  try {
    const names = await fs.readdir(PENDING_DIR);
    const drafts: PendingDraft[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(PENDING_DIR, name), "utf8");
        const draft = JSON.parse(raw) as PendingDraft;
        if (draft.status === "ready") drafts.push(draft);
      } catch {
        // skip corrupt
      }
    }
    return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function markPendingDraftForwarded(workflowId: string): Promise<PendingDraft | null> {
  const draft = await loadPendingDraft(workflowId);
  if (!draft) return null;
  draft.status = "forwarded";
  await fs.writeFile(draftPath(workflowId), JSON.stringify(draft, null, 2), "utf8");
  return draft;
}

export function formatDraftForOwner(sendPlan: SendPlan, workflowName: string): string {
  const lines = [
    `CPB draft — ${workflowName}`,
    "",
    `Forward to: ${sendPlan.group}`,
    "",
    "---",
    sendPlan.message,
    "---",
    "",
    `Context: ${sendPlan.context} · Variant ${sendPlan.variant}`,
  ];
  if (sendPlan.planDate) lines.push(`Plan date: ${sendPlan.planDate}`);
  return lines.join("\n");
}
