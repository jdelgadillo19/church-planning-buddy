import { RIG_DOWNLOAD_PATHS } from "@/lib/grapevine-rig-downloads";

/** Legacy Grapevine Prep Windows URL → Grapevine Client installer. */
export async function GET(request: Request) {
  return Response.redirect(new URL(RIG_DOWNLOAD_PATHS.windows, request.url), 302);
}
