import { NextResponse } from "next/server";

/** CORS for Grapevine Client remote prep fetch from Tauri webview. */
export const REMOTE_PREP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function isRemotePrepClientApiPath(pathname: string): boolean {
  return /^\/api\/remote-prep\/jobs\/[^/]+(\/run-context|\/pull)?$/.test(pathname);
}

export function remotePrepCorsPreflightResponse(): NextResponse {
  return applyRemotePrepCors(new NextResponse(null, { status: 204 }));
}

export function applyRemotePrepCors(response: Response): Response {
  for (const [key, value] of Object.entries(REMOTE_PREP_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
