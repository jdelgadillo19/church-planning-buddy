import { NextResponse } from "next/server";
import {
  loadProPresenterConfig,
  proPresenterBaseUrl,
} from "@/lib/propresenter/config";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";

export async function GET() {
  const config = loadProPresenterConfig();
  const baseUrl = proPresenterBaseUrl(config);

  try {
    await ppPing(config);
    return NextResponse.json({
      ok: true,
      connected: true,
      baseUrl,
      allowWrites: config.allowWrites,
      host: config.host,
      port: config.port,
      https: config.https,
    });
  } catch (e) {
    const message =
      e instanceof ProPresenterApiError ? e.message : e instanceof Error ? e.message : "Probe failed.";
    return NextResponse.json({
      ok: true,
      connected: false,
      baseUrl,
      allowWrites: config.allowWrites,
      host: config.host,
      port: config.port,
      https: config.https,
      error: message,
    });
  }
}
