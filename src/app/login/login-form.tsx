"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  redirectTo?: string;
};

export function LoginForm({ redirectTo }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const next = redirectTo?.startsWith("/") ? redirectTo : "/";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const next = redirectTo?.startsWith("/") ? redirectTo : "/";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else setMessage("Check your email for a sign-in link.");
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={busy}
        className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-60"
      >
        Continue with Google
      </button>
      <div className="relative text-center text-xs text-zinc-500">
        <span className="bg-zinc-50 px-2 dark:bg-black">or</span>
      </div>
      <form onSubmit={(e) => void signInWithEmail(e)} className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          placeholder="you@church.org"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Email me a link
        </button>
      </form>
      {message ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}
    </div>
  );
}
