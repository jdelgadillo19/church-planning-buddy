import { NextResponse } from "next/server";

/** ProPresenter Local API is only reachable from the operator Mac — not from Cloudflare Workers. */
export function isProPresenterUnavailableOnHosted(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.PP_UNAVAILABLE_ON_HOSTED === "true") return true;
  const host = (env.PP_HOST?.trim() || "127.0.0.1").toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export const PP_HOSTED_ERROR_CODE = "pp_hosted_unavailable" as const;

export const PP_HOSTED_MESSAGE =
  "ProPresenter runs on the operator Mac only. Use the Mac agent, local CLI, or upload a .proplaylist for Drive publish.";

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
