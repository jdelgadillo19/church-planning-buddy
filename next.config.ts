import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  output: process.env.PREP_STANDALONE === "1" ? "standalone" : undefined,
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
