import { NextResponse } from "next/server";
import {
  completeSlideDeckJob,
  failSlideDeckJob,
  type SlideDeckJobRow,
} from "@/lib/slide-deck/agent-jobs";
import { isSlideDeckAgentAuthorized } from "@/lib/slide-deck/agent-auth";
import type { ApplyCommitResult } from "@/lib/slide-deck/apply-commit";
import type { SlideDeckPublishResult } from "@/lib/slide-deck/publish-types";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH — Mac agent reports job completion or failure. */
export async function PATCH(req: Request, context: RouteContext) {
  if (!isSlideDeckAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Agent not authorized." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      status?: "completed" | "failed";
      error?: string;
      result?: {
        apply?: ApplyCommitResult;
        publish?: SlideDeckPublishResult;
      };
    };

    if (body.status === "failed") {
      const job = await failSlideDeckJob(id, body.error?.trim() || "Agent reported failure.");
      return NextResponse.json({ ok: true, job });
    }

    if (body.status === "completed") {
      const job = await completeSlideDeckJob(id, body.result ?? null);
      return NextResponse.json({ ok: true, job });
    }

    return NextResponse.json({ ok: false, error: "status must be completed or failed." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update job.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** GET — agent fetches job by id (optional). */
export async function GET(req: Request, context: RouteContext) {
  if (!isSlideDeckAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Agent not authorized." }, { status: 401 });
  }

  const { id } = await context.params;
  return NextResponse.json({
    ok: true,
    job: { id } satisfies Partial<SlideDeckJobRow>,
  });
}
