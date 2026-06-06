import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "google-auth-library",
    "@googleapis/drive",
    "@googleapis/docs",
    "@googleapis/sheets",
    "@googleapis/calendar",
  ],
};

export default nextConfig;

initOpenNextCloudflareForDev();
