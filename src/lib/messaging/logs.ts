import fs from "node:fs/promises";
import path from "node:path";

export type MessagingLogEntry = {
  at: string;
  workflowId: string;
  status: "sent" | "failed" | "blocked" | "preview";
  group: string;
  purpose: string;
  context: string;
  variant?: string;
  error?: string;
};

const LOG_PATH = path.join(process.cwd(), ".data", "messaging-send-log.jsonl");

export async function appendMessagingLog(entry: Omit<MessagingLogEntry, "at">): Promise<void> {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  const line: MessagingLogEntry = { ...entry, at: new Date().toISOString() };
  await fs.appendFile(LOG_PATH, `${JSON.stringify(line)}\n`, "utf8");
}

export async function readRecentMessagingLogs(limit = 20): Promise<MessagingLogEntry[]> {
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => JSON.parse(l) as MessagingLogEntry)
      .reverse();
  } catch {
    return [];
  }
}
