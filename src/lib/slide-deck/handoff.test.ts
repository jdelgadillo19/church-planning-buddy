import assert from "node:assert/strict";
import { sortHandoffsForDiscovery, defaultHandoffSelection } from "./handoff";
import type { SlideDeckSubmissionRow } from "@/lib/pp-platform/types";

function handoff(partial: Partial<SlideDeckSubmissionRow> & { id: string }): SlideDeckSubmissionRow {
  return {
    id: partial.id,
    org_id: "org",
    plan_id: "1",
    service_type_id: null,
    playlist_name: "SUN 2026.06.08",
    created_by: "user",
    status: "draft",
    handoff_status: partial.handoff_status ?? null,
    missing_elements: partial.missing_elements ?? [],
    missing_files: partial.missing_files ?? [],
    parent_handoff_id: partial.parent_handoff_id ?? null,
    presentation_instance_id: partial.presentation_instance_id ?? partial.id,
    services_package_id: null,
    services_drive_url: null,
    rig_handoff_status: null,
    replace_on_rig: false,
    admin_approved_for_rig: false,
    version_label: null,
    playlist_file_mtime: partial.playlist_file_mtime ?? null,
    commit_plan: partial.commit_plan as SlideDeckSubmissionRow["commit_plan"],
    library_selections: {},
    manifest: null,
    change_summary: null,
    created_at: partial.created_at ?? "2026-06-10T10:00:00Z",
    updated_at: partial.updated_at ?? "2026-06-10T10:00:00Z",
  };
}

const incomplete = handoff({
  id: "a",
  handoff_status: "incomplete",
  created_at: "2026-06-12T10:00:00Z",
  commit_plan: { playlistName: "x" } as SlideDeckSubmissionRow["commit_plan"],
});
const completeOld = handoff({
  id: "b",
  handoff_status: "complete",
  created_at: "2026-06-10T10:00:00Z",
  commit_plan: { playlistName: "x" } as SlideDeckSubmissionRow["commit_plan"],
});
const completeNew = handoff({
  id: "c",
  handoff_status: "complete",
  created_at: "2026-06-10T10:00:00Z",
  playlist_file_mtime: "2026-06-14T12:00:00Z",
  commit_plan: { playlistName: "x" } as SlideDeckSubmissionRow["commit_plan"],
});
const completeNewerFile = handoff({
  id: "d",
  handoff_status: "complete",
  created_at: "2026-06-08T10:00:00Z",
  playlist_file_mtime: "2026-06-15T08:00:00Z",
  commit_plan: { playlistName: "x" } as SlideDeckSubmissionRow["commit_plan"],
});

const sorted = sortHandoffsForDiscovery([incomplete, completeOld, completeNew, completeNewerFile]);
assert.equal(sorted[0]?.id, "d", "newest file mtime complete first");
assert.equal(defaultHandoffSelection(sorted)?.id, "d");

console.log("handoff.test.ts ok");
