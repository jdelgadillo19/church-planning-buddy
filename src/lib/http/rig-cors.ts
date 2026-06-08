import { NextResponse } from "next/server";

/** CORS for Grapevine Rig (Tauri webview fetch from tauri:// / asset origins). */
export const RIG_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function isRigCorsApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/pp/rigs");
}

export function rigCorsPreflightResponse(): NextResponse {
  return applyRigCors(new NextResponse(null, { status: 204 }));
}

export function applyRigCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(RIG_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
