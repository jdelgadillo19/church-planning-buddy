"use client";

import { useMemo, useState } from "react";

export default function Home() {
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [planId, setPlanId] = useState("");
  const [outputMode, setOutputMode] = useState<"full" | "songs">("full");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songOrderText, setSongOrderText] = useState("");
  const [lastLoadOk, setLastLoadOk] = useState(false);
  const [lastLines, setLastLines] = useState<string[]>([]);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<
    Array<{ songTitle: string; tier: "green" | "yellow" | "red"; message: string; url?: string }>
  >([]);

  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveDocText, setDriveDocText] = useState("");
  const [driveDocMeta, setDriveDocMeta] = useState<{ id: string; name: string } | null>(null);

  const canLoad = useMemo(() => {
    return planId.trim().length > 0 && !isLoading;
  }, [planId, isLoading]);

  async function loadSongOrder() {
    setIsLoading(true);
    setError(null);
    setSongOrderText("");
    setLastLoadOk(false);
    setLastLines([]);

    try {
      const res = await fetch("/api/pco/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceTypeId: serviceTypeId.trim(),
          planId: planId.trim(),
          outputMode,
        }),
      });

      const payload = (await res.json()) as
        | { ok: true; songOrderText: string; lines: string[]; outputMode: "full" | "songs" }
        | { ok: false; error: string };

      if (!res.ok || !payload.ok) {
        throw new Error(payload.ok ? "Request failed" : payload.error);
      }

      setSongOrderText(payload.songOrderText);
      setLastLoadOk(true);
      setLastLines(Array.isArray(payload.lines) ? payload.lines : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  const canScan = useMemo(() => {
    return (
      lastLoadOk &&
      outputMode === "songs" &&
      lastLines.length > 0 &&
      !isLoading &&
      !isScanning
    );
  }, [lastLoadOk, outputMode, lastLines.length, isLoading, isScanning]);

  async function scanSongResources() {
    setIsScanning(true);
    setError(null);
    setScanResults([]);

    try {
      const res = await fetch("/api/pco/song-scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceTypeId: serviceTypeId.trim(),
          planId: planId.trim(),
        }),
      });

      const payload = (await res.json()) as
        | {
            ok: true;
            results: Array<{
              songTitle: string;
              tier: "green" | "yellow" | "red";
              message: string;
              url?: string;
            }>;
          }
        | { ok: false; error: string };

      if (!res.ok || !payload.ok) {
        throw new Error(payload.ok ? "Request failed" : payload.error);
      }

      setScanResults(Array.isArray(payload.results) ? payload.results : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsScanning(false);
    }
  }

  const canFetchBlankDoc = useMemo(() => {
    return lastLoadOk && outputMode === "songs" && !isLoading && !isScanning && !isDriveLoading;
  }, [lastLoadOk, outputMode, isLoading, isScanning, isDriveLoading]);

  async function fetchBlankDoc() {
    setIsDriveLoading(true);
    setError(null);
    setDriveDocText("");
    setDriveDocMeta(null);

    try {
      const res = await fetch("/api/drive/blank-doc", { method: "POST" });
      const payload = (await res.json()) as
        | { ok: true; file: { id: string; name: string }; text: string }
        | { ok: false; error: string };

      if (!res.ok || !payload.ok) {
        throw new Error(payload.ok ? "Request failed" : payload.error);
      }

      setDriveDocMeta(payload.file);
      setDriveDocText(payload.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsDriveLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Church Planning Buddy</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Load a plan from Planning Center and print the song order into the text field.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Service Type ID (optional)
              </span>
              <input
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                placeholder="Leave blank to auto-detect"
                inputMode="numeric"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none ring-0 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Plan ID
              </span>
              <input
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                placeholder="e.g. 987654"
                inputMode="numeric"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none ring-0 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
              />
            </label>

            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Output</span>
              <select
                value={outputMode}
                onChange={(e) => setOutputMode(e.target.value as "full" | "songs")}
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none ring-0 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
              >
                <option value="full">Full plan</option>
                <option value="songs">Songs only</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canLoad}
              onClick={loadSongOrder}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
            >
              {isLoading ? "Loading..." : "Load song order"}
            </button>

            {error ? (
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {outputMode === "songs" ? "Song order" : "Plan order"}
            </div>
            <textarea
              value={songOrderText}
              readOnly
              placeholder={outputMode === "songs" ? "Songs will show up here." : "Plan items will show up here."}
              className="min-h-48 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
            />
          </div>

          <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Song scan links</div>

            <div className="flex items-center gap-3">
              <a
                href="/api/auth/google/start"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              >
                Connect Google Drive
              </a>

              <button
                type="button"
                disabled={!canScan}
                onClick={scanSongResources}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
              >
                {isScanning ? "Scanning..." : "Scan songs"}
              </button>

              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Enabled after a successful load in Songs only mode.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-950">
              {scanResults.length === 0 ? (
                <div className="text-zinc-500 dark:text-zinc-400">Results will show up here.</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {scanResults.map((r) => {
                    const color =
                      r.tier === "green"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : r.tier === "yellow"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400";

                    return (
                      <div key={`${r.songTitle}-${r.message}`} className={`break-words ${color}`}>
                        <span className="font-medium">{r.songTitle}</span>
                        <span>{" — "}</span>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            {r.message}
                          </a>
                        ) : (
                          <span>{r.message}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Google Doc: title contains “blank”
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!canFetchBlankDoc}
                onClick={fetchBlankDoc}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
              >
                {isDriveLoading ? "Fetching..." : "Fetch blank doc"}
              </button>

              {driveDocMeta ? (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">{driveDocMeta.name}</div>
              ) : null}
            </div>

            <textarea
              value={driveDocText}
              readOnly
              placeholder="Doc content will show up here."
              className="min-h-40 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
