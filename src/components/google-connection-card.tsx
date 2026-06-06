"use client";

import { useGoogleConnection, googleSaveErrorMessage } from "@/hooks/use-google-connection";

type GoogleConnectionCardProps = {
  compact?: boolean;
  hint?: string;
};

export function GoogleConnectionCard({ compact = false, hint }: GoogleConnectionCardProps) {
  const {
    connected,
    scopes,
    loading,
    connectHref,
    disconnect,
    reauthRequired,
    saveFailed,
    saveError,
    adminConfigured,
    driveProbeOk,
  } = useGoogleConnection();

  const scopeSummary =
    scopes.length > 0
      ? scopes
          .map((s) => s.replace(/^https:\/\/www\.googleapis\.com\/auth\//, ""))
          .join(", ")
      : null;

  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Google</h2>
        {loading ? (
          <span className="text-xs text-zinc-500">Checking…</span>
        ) : (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              connected
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {connected ? "Connected" : "Not connected"}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {hint ??
          (connected
            ? "Drive, Docs, Sheets, and Calendar access persist across all CPB tools."
            : "Connect once to use Drive-backed workflows in any tool.")}
      </p>
      {saveFailed ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {googleSaveErrorMessage(saveError, adminConfigured)} Try Connect Google again or sign
          out and back in.
        </p>
      ) : null}
      {connected && !driveProbeOk && !saveFailed ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Google tokens are saved, but the GRG template is not reachable on Drive yet. Run{" "}
          <strong>Diagnose Drive setup</strong> on GRG — confirm the connected account can open the
          church template folder, or reconnect with the church Google account.
        </p>
      ) : null}
      {reauthRequired && !connected && !saveFailed ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          CPB login does not grant Drive access by itself. Click <strong>Connect Google</strong>{" "}
          below to authorize Drive, Docs, Sheets, and Calendar.
        </p>
      ) : null}
      {connected && scopeSummary ? (
        <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-500" title={scopeSummary}>
          Scopes: {scopeSummary}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={connectHref}
          className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm font-medium dark:border-zinc-700"
        >
          {connected ? "Reconnect Google" : "Connect Google"}
        </a>
        {connected ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 hover:border-red-300 hover:text-red-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:text-red-300"
          >
            Disconnect
          </button>
        ) : null}
      </div>
    </section>
  );
}
