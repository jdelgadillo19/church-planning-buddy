import { serveRigDownload } from "@/lib/grapevine-rig-download-serve";

export async function GET() {
  return serveRigDownload("macos");
}
