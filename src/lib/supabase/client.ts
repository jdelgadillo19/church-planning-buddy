import { createBrowserClient } from "@supabase/ssr";
import { isGrapevineAuthEnabled } from "./config";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
  }
  return createBrowserClient(url, key);
}

export function createClientIfConfigured() {
  if (!isGrapevineAuthEnabled()) return null;
  return createClient();
}
