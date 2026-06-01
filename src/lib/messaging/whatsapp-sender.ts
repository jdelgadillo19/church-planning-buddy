import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { messagingScriptPath } from "@/lib/config/messaging";

export type WhatsappSendOptions = {
  group: string;
  message: string;
  /** When false, script pastes but does not press send (script-dependent). */
  doSend: boolean;
};

export async function sendViaWhatsappAppleScript(
  options: WhatsappSendOptions,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const scriptRel = messagingScriptPath();
  const scriptAbs = path.resolve(process.cwd(), scriptRel);

  try {
    await fs.access(scriptAbs);
  } catch {
    return {
      ok: false,
      stdout: "",
      stderr: `Script not found: ${scriptRel}`,
    };
  }

  const sendFlag = options.doSend ? "send" : "draft";

  return new Promise((resolve) => {
    const child = spawn(
      "osascript",
      [scriptAbs, options.group, options.message, sendFlag],
      { cwd: process.cwd() },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
    child.on("error", (err) => {
      resolve({ ok: false, stdout: "", stderr: err.message });
    });
  });
}
