import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Headless-friendly alert when a user is logged in (no WhatsApp Desktop required). */
export async function sendMacOsNotification(input: {
  title: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.slice(0, 200);
  const message = input.message.slice(0, 500);
  try {
    await execFileAsync("/usr/bin/osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Notification failed" };
  }
}
