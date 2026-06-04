import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isGrapevineAuthEnabled } from "./config";

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

export async function createClientIfConfigured() {
  if (!isGrapevineAuthEnabled()) return null;
  return createClient();
}
