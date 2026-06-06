"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className="text-sm text-zinc-500 underline hover:text-zinc-800 disabled:opacity-60 dark:hover:text-zinc-200"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
