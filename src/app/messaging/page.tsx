"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleConnectionCard } from "@/components/google-connection-card";
import { ToolShell } from "@/components/tool-shell";
import type { PendingDraft } from "@/lib/messaging/pending-drafts";
import type { MessagingConfig, MessagingHealthResult, SendPlan } from "@/lib/messaging/types";

export default function MessagingPage() {
  const [config, setConfig] = useState<MessagingConfig | null>(null);
  const [workflowId, setWorkflowId] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState("");
  const [health, setHealth] = useState<MessagingHealthResult | null>(null);
  const [preview, setPreview] = useState<SendPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDraft[]>([]);

  const activeWorkflow = config?.workflows.find((w) => w.id === workflowId);
  const isDraftForward =
    (activeWorkflow?.deliveryMode ?? "draft_forward") === "draft_forward";

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      fetch("/api/messaging/config").then((r) => r.json()),
      fetch("/api/messaging/pending").then((r) => r.json()),
    ]);
    setPending((p as { drafts: PendingDraft[] }).drafts ?? []);
    const cfg = (c as { config: MessagingConfig }).config;
    setConfig(cfg);
    if (!workflowId && cfg.workflows[0]) {
      setWorkflowId(cfg.workflows[0].id);
      setSelectedGroups([cfg.workflows[0].targetGroup]);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeWorkflow) return;
    setSelectedGroups([activeWorkflow.targetGroup]);
  }, [workflowId, activeWorkflow?.targetGroup]);

  async function saveConfig(next: MessagingConfig) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messaging/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      if (!res.ok) throw new Error("Failed to save config");
      setConfig(next);
      setMessage("Config saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleGroup(name: string) {
    setSelectedGroups((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name],
    );
  }

  async function runHealth() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const group = selectedGroups[0] ?? activeWorkflow?.targetGroup;
      const res = await fetch("/api/messaging/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          group,
          purpose: activeWorkflow?.purpose,
        }),
      });
      const data = await res.json();
      setHealth(data.health as MessagingHealthResult);
      if (!data.health?.ok) setError("Health check has blocking issues.");
      else setMessage("Health check passed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const group = selectedGroups[0] ?? activeWorkflow?.targetGroup;
      const res = await fetch("/api/messaging/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, group }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHealth(data.health ?? null);
        throw new Error(data.error ?? "Preview failed");
      }
      setHealth(data.health);
      setPreview(data.sendPlan as SendPlan);
      setMessage("Preview ready.");
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPrepare() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const group = selectedGroups[0] ?? activeWorkflow?.targetGroup;
      const res = await fetch("/api/messaging/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, group }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prepare failed");
      const result = data.result;
      if (result?.sendPlan) setPreview(result.sendPlan);
      setMessage(
        result?.awaitingForward
          ? `Draft delivered (${(result.deliveryChannels ?? []).join(", ")}). Forward to the group, then mark done.`
          : "Prepared.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prepare failed");
    } finally {
      setBusy(false);
    }
  }

  async function markForwarded() {
    setBusy(true);
    try {
      const res = await fetch("/api/messaging/pending/forwarded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId }),
      });
      if (!res.ok) throw new Error("Failed to mark forwarded");
      setMessage("Marked as forwarded.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function copyDraft() {
    const text = preview?.message;
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setMessage("Copied message to clipboard.");
  }

  async function runSend(confirmSend: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const group = selectedGroups[0] ?? activeWorkflow?.targetGroup;
      const res = await fetch("/api/messaging/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, group, confirmSend, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      const result = data.result;
      if (result?.sendPlan) setPreview(result.sendPlan);
      if (result?.error && !result?.ok) setError(result.error);
      else if (result?.ok)
        setMessage(
          confirmSend
            ? "Send completed."
            : isDraftForward
              ? "Draft prepared."
              : "Prepared — check notification.",
        );
      else setMessage(result?.error ?? "Done.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  function addNewGroup() {
    const name = newGroup.trim();
    if (!name || !config) return;
    if (!config.knownGroups.includes(name)) {
      const next = { ...config, knownGroups: [...config.knownGroups, name] };
      void saveConfig(next);
    }
    setNewGroup("");
    toggleGroup(name);
  }

  return (
    <ToolShell
      toolId="messaging"
      description="Sheet-backed messages: scheduled prepare (headless) → draft to you → forward to the group. Optional desktop auto-post."
    >
      <div className="flex flex-col gap-6">
        <GoogleConnectionCard
          hint="Includes Sheets and Calendar for Team Messaging after reconnect."
        />

        {config ? (
          <>
            <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold">Workflow</h2>
              <select
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              >
                {config.workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.mode})
                  </option>
                ))}
              </select>
              {activeWorkflow ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Purpose: {activeWorkflow.purpose} · Mode:{" "}
                  {activeWorkflow.deliveryMode ?? "draft_forward"} · Thu 08:00
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold">Target group</h2>
              <p className="mt-1 text-xs text-zinc-500">
                v1 sends to the first selected group. Add names that match WhatsApp search exactly.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {config.knownGroups.map((g) => (
                  <li key={g}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(g)}
                        onChange={() => toggleGroup(g)}
                      />
                      {g}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="New group name"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                  onClick={addNewGroup}
                  disabled={busy}
                >
                  Add
                </button>
              </div>
            </section>

            {pending.length > 0 ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <h2 className="text-sm font-semibold">Pending drafts</h2>
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {pending.map((d) => (
                    <li key={d.id}>
                      <span className="font-medium">{d.workflowName}</span> → {d.sendPlan.group}{" "}
                      <span className="text-zinc-500">({new Date(d.createdAt).toLocaleString()})</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                onClick={() => void runHealth()}
                disabled={busy}
              >
                Run health check
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                onClick={() => void runPreview()}
                disabled={busy}
              >
                Preview message
              </button>
              {isDraftForward ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white"
                    onClick={() => void runPrepare()}
                    disabled={busy}
                  >
                    Prepare & deliver draft
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                    onClick={copyDraft}
                    disabled={busy || !preview}
                  >
                    Copy message
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white"
                    onClick={() => void markForwarded()}
                    disabled={busy}
                  >
                    Mark forwarded
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:text-red-300"
                    onClick={() => void runSend(true)}
                    disabled={busy}
                    title="Legacy: post directly via WhatsApp Desktop (needs GUI)"
                  >
                    Post via desktop (optional)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white"
                    onClick={() => void runSend(false)}
                    disabled={busy}
                  >
                    Prepare send (ask)
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white"
                    onClick={() => void runSend(true)}
                    disabled={busy}
                  >
                    Confirm & send
                  </button>
                </>
              )}
            </section>

            {health ? (
              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-medium">{health.ok ? "Health: OK" : "Health: blocked"}</p>
                <ul className="mt-2 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
                  {health.checks.map((c) => (
                    <li key={c.id}>
                      [{c.severity}] {c.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {preview ? (
              <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold">Preview</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Group: {preview.group} · Context: {preview.context} · Variant: {preview.variant}
                  {preview.planDate ? ` · Plan: ${preview.planDate}` : ""}
                </p>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
                  {preview.message}
                </pre>
              </section>
            ) : null}
          </>
        ) : null}

        {message ? (
          <p className="text-sm text-green-700 dark:text-green-400" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <section className="text-xs text-zinc-500">
          <p>
            Default: <strong>draft_forward</strong> — 8:00 schedule prepares the message and sends a draft to you
            (WhatsApp Cloud API, webhook, or macOS notification). You forward into the group manually.
          </p>
          <p className="mt-2">
            Scheduled:{" "}
            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
              npm run messaging:run -- --workflow saddleback-signup-reminder
            </code>{" "}
            — see docs/MESSAGING.md.
          </p>
        </section>
      </div>
    </ToolShell>
  );
}
