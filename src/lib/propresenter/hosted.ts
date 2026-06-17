import { NextResponse } from "next/server";
import { PP_HOSTED_MESSAGE } from "@/lib/slide-deck/device-context";

/**
 * True when this deployment cannot reach ProPresenter (Cloudflare Workers).
 * Set PP_UNAVAILABLE_ON_HOSTED=true in Worker env only — not on local prep machines.
 */
export function isProPresenterUnavailableOnHosted(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PP_UNAVAILABLE_ON_HOSTED === "true";
}

export const PP_HOSTED_ERROR_CODE = "pp_hosted_unavailable" as const;

export { PP_HOSTED_MESSAGE };

export type PpHostedUnavailableBody = {
  ok: false;
  code: typeof PP_HOSTED_ERROR_CODE;
  error: string;
  hosted: true;
};

export function ppHostedUnavailableBody(): PpHostedUnavailableBody {
  return {
    ok: false,
    code: PP_HOSTED_ERROR_CODE,
    error: PP_HOSTED_MESSAGE,
    hosted: true,
  };
}

/** Return a 503 JSON response when PP cannot run on this host. */
export function ppHostedUnavailableResponse(): NextResponse<PpHostedUnavailableBody> {
  return NextResponse.json(ppHostedUnavailableBody(), { status: 503 });
}

/** True when publish can run on hosted via uploaded .proplaylist (no AppleScript). */
export function hasHostedProplaylistUpload(input: {
  proplaylistBase64?: string | null;
  newFiles?: Array<{ name?: string; contentBase64?: string }> | null;
}): boolean {
  if (input.proplaylistBase64?.trim()) return true;
  for (const file of input.newFiles ?? []) {
    const name = file.name?.trim().toLowerCase() ?? "";
    if (name.endsWith(".proplaylist") && file.contentBase64?.trim()) return true;
  }
  return false;
}
