import { NextResponse } from "next/server";
import {
  loadProPresenterConfig,
  proPresenterBaseUrl,
} from "@/lib/propresenter/config";
import { isProPresenterUnavailableOnHosted, PP_HOSTED_MESSAGE } from "@/lib/propresenter/hosted";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";

export async function GET() {
  const config = loadProPresenterConfig();
  const baseUrl = proPresenterBaseUrl(config);

  if (isProPresenterUnavailableOnHosted()) {
    return NextResponse.json({
      ok: true,
      connected: false,
      hosted: true,
      baseUrl,
      allowWrites: config.allowWrites,
      host: config.host,
      port: config.port,
      https: config.https,
      error: PP_HOSTED_MESSAGE,
    });
  }

  try {
    await ppPing(config);
    return NextResponse.json({
      ok: true,
      connected: true,
      hosted: false,
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
      hosted: false,
      baseUrl,
      allowWrites: config.allowWrites,
      host: config.host,
      port: config.port,
      https: config.https,
      error: message,
    });
  }
}
