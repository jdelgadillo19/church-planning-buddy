import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GuiSessionStatus = {
  /** macOS console user (logged into GUI), if any */
  consoleUser: string | null;
  /** Heuristic: screen not locked (best-effort; may be unknown) */
  screenUnlocked: boolean | null;
  /** Suitable for WhatsApp Desktop UI automation */
  whatsappDesktopViable: boolean;
};

/** Best-effort GUI session probe for scheduling decisions. */
export async function probeGuiSession(): Promise<GuiSessionStatus> {
  let consoleUser: string | null = null;
  try {
    const { stdout } = await execFileAsync("/usr/bin/stat", ["-f%Su", "/dev/console"]);
    const user = stdout.trim();
    if (user && user !== "root" && user !== "_mbsetupuser") {
      consoleUser = user;
    }
  } catch {
    consoleUser = null;
  }

  let screenUnlocked: boolean | null = null;
  try {
    const { stdout } = await execFileAsync("/usr/bin/python3", [
      "-c",
      'import ctypes; lib=ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"); print(0 if lib.CGSessionCopyCurrentDictionary() else 1)',
    ]);
    screenUnlocked = stdout.trim() === "0";
  } catch {
    screenUnlocked = null;
  }

  const whatsappDesktopViable = Boolean(consoleUser) && screenUnlocked !== false;

  return { consoleUser, screenUnlocked, whatsappDesktopViable };
}
