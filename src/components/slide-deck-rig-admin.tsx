"use client";

import { useState } from "react";

type Rig = {
  id: string;
  displayName: string;
  lastSeenAt: string | null;
};

type Props = {
  orgId: string | null;
  isAdmin: boolean;
  rigs: Rig[];
  onRigsChange: () => void;
};

export function SlideDeckRigAdmin({ orgId, isAdmin, rigs, onRigsChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);

  if (!isAdmin || !orgId) return null;

  async function createPairingCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pp/rigs/pairing-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        expiresAt?: string;
      };
      if (!data.ok || !data.code || !data.expiresAt) {
        throw new Error(data.error ?? "Failed to create pairing code.");
      }
      setPairing({ code: data.code, expiresAt: data.expiresAt });
      onRigsChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create pairing code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
      <h3 className="text-sm font-medium">Presentation rigs (admin)</h3>
      <p className="text-xs opacity-90">
        Install Grapevine Rig on the presentation Mac, then generate a pairing code and enter it in
        the app. Codes expire in 15 minutes.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void createPairingCode()}
          className="h-9 rounded-lg bg-violet-800 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-violet-600"
        >
          {busy ? "Generating…" : "Add presentation rig"}
        </button>
      </div>

      {pairing ? (
        <p className="rounded-lg border border-violet-300 bg-white px-3 py-2 font-mono text-sm dark:border-violet-800 dark:bg-violet-950">
          Code: <strong className="tracking-widest">{pairing.code}</strong> — expires{" "}
          {new Date(pairing.expiresAt).toLocaleTimeString()}
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-700 dark:text-red-300">{error}</p> : null}

      {rigs.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {rigs.map((rig) => (
            <li key={rig.id} className="flex flex-wrap gap-2">
              <span className="font-medium">{rig.displayName}</span>
              <span className="font-mono opacity-70">{rig.id.slice(0, 8)}…</span>
              {rig.lastSeenAt ? (
                <span className="opacity-70">
                  last seen {new Date(rig.lastSeenAt).toLocaleString()}
                </span>
              ) : (
                <span className="opacity-70">never connected</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs opacity-80">No rigs paired yet.</p>
      )}
    </section>
  );
}
