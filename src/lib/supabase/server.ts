import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isGrapevineAuthEnabled } from "./config";

function parseCookieHeader(header: string): { name: string; value: string }[] {
  if (!header.trim()) return [];
  return header.split(";").flatMap((part) => {
    const eq = part.indexOf("=");
    if (eq < 1) return [];
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    try {
      return [{ name, value: decodeURIComponent(raw) }];
    } catch {
      return [{ name, value: raw }];
    }
  });
}

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from Server Component; middleware refreshes sessions.
        }
      },
    },
  });
}

/** Supabase client from incoming Request cookies (OAuth callback on Workers). */
export function createClientFromRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }

  const cookieHeader = request.headers.get("cookie") ?? "";

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader);
      },
      setAll() {
        // Read-only — callback does not mutate Supabase session cookies here.
      },
    },
  });
}

export async function createClientIfConfigured() {
  if (!isGrapevineAuthEnabled()) return null;
  return createClient();
}

export function createClientFromRequestIfConfigured(request: Request) {
  if (!isGrapevineAuthEnabled()) return null;
  return createClientFromRequest(request);
}
