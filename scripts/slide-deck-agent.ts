/**
 * Mac agent: poll hosted Grapevine Prep for slide-deck jobs and run apply/publish locally.
 *
 *   SLIDE_DECK_AGENT_TOKEN=... GRAPEVINE_PREP_URL=https://grapevineprep.com \
 *     npm run slide-deck:agent
 *
 * Requires on this Mac: ProPresenter running, PP_ALLOW_WRITES=true, Google tokens for job user in Supabase.
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { runSlideDeckAgentJob } from "../src/lib/slide-deck/run-agent-job";
import type { SlideDeckJobRow } from "../src/lib/slide-deck/agent-jobs";

function agentConfig() {
  const token = process.env.SLIDE_DECK_AGENT_TOKEN?.trim();
  const baseUrl = (process.env.GRAPEVINE_PREP_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const pollMs = Number(process.env.SLIDE_DECK_AGENT_POLL_MS ?? "5000");
  if (!token) {
    throw new Error("Set SLIDE_DECK_AGENT_TOKEN in .env.local (must match hosted Worker secret).");
  }
  return { token, baseUrl, pollMs: Number.isFinite(pollMs) ? pollMs : 5000 };
}

async function agentFetch(path: string, init?: RequestInit) {
  const { token, baseUrl } = agentConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error ?? `Agent API ${res.status}`));
  }
  return data;
}

async function processJob(job: SlideDeckJobRow) {
  console.log(`[agent] Processing job ${job.id} plan=${job.plan_id} playlist=${job.commit_plan.playlistName}`);
  try {
    const result = await runSlideDeckAgentJob(job);
    await agentFetch(`/api/slide-deck/agent/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed", result }),
    });
    console.log(`[agent] Completed job ${job.id}`);
    if (result.publish?.driveFolderUrl) {
      console.log(`[agent] Drive folder: ${result.publish.driveFolderUrl}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Agent job failed";
    console.error(`[agent] Failed job ${job.id}:`, message);
    await agentFetch(`/api/slide-deck/agent/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "failed", error: message }),
    });
  }
}

async function pollOnce() {
  const data = (await agentFetch("/api/slide-deck/agent/jobs")) as {
    ok?: boolean;
    job?: SlideDeckJobRow | null;
  };
  if (data.job) {
    await processJob(data.job);
    return true;
  }
  return false;
}

async function main() {
  const { baseUrl, pollMs } = agentConfig();
  console.log(`[agent] Polling ${baseUrl} every ${pollMs}ms`);
  for (;;) {
    try {
      const worked = await pollOnce();
      if (!worked) {
        await new Promise((r) => setTimeout(r, pollMs));
      }
    } catch (e) {
      console.error("[agent] Poll error:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
