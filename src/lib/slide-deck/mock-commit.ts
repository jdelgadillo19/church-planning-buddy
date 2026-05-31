import { matchLibraryItem, type LibraryMatchResult, type PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import type { ManifestElement, SlideDeckManifest } from "./types";
import {
  findTemplateItemById,
  resolveTemplateCorrespondence,
  templatePrefixBeforeWelcome,
} from "./pco-pp-correspondence";

export type MockCommitOperation = {
  step: number;
  action: "duplicate_playlist" | "rename_playlist" | "add_to_playlist" | "template_slot";
  label: string;
  detail?: string;
  apiMethod?: string;
  apiPath?: string;
  status: "planned" | "blocked" | "missing_prerequisite";
};

export type MockCommitPlaylistRow = {
  position: number;
  kind: "template_inherit" | "song_add";
  name: string;
  source: string;
  libraryMatch?: LibraryMatchResult;
  pcoTitle?: string;
  pcoOrder?: number;
  key?: string;
  artist?: string;
  /** PCO item that triggered this template slot (e.g. Welcome → WELCOME-Sundays). */
  pcoCorrespondence?: string;
};

export type MockCommitPlan = {
  dryRun: true;
  writesBlocked: true;
  planId: number;
  playlistName: string;
  templateSource: string;
  templateItemCount: number;
  operations: MockCommitOperation[];
  playlistPreview: MockCommitPlaylistRow[];
  correspondences: Array<{
    pcoTitle: string;
    pcoOrder: number;
    ppItemName?: string;
    status: string;
    note?: string;
  }>;
  warnings: string[];
  propresenterConnected: boolean;
};

export type BuildMockCommitInput = {
  manifest: SlideDeckManifest;
  templateItems: PpPlaylistItemRef[];
  libraryIndex: PpLibraryItemRef[];
  propresenterConnected: boolean;
};

function buildOperations(
  manifest: SlideDeckManifest,
  playlistPreview: MockCommitPlaylistRow[],
): MockCommitOperation[] {
  const ops: MockCommitOperation[] = [];
  let step = 1;

  const templateReady = manifest.template.sourceFound === true && manifest.template.sourcePlaylistId;

  ops.push({
    step: step++,
    action: "duplicate_playlist",
    label: `Duplicate "${manifest.template.sourcePlaylistName}"`,
    detail: templateReady
      ? `Source playlist ${manifest.template.sourcePlaylistId}`
      : "Template playlist not found — would fail.",
    apiMethod: "POST",
    apiPath: "v1/playlists (duplicate — endpoint TBD at write phase)",
    status: templateReady ? "planned" : "missing_prerequisite",
  });

  ops.push({
    step: step++,
    action: "rename_playlist",
    label: `Rename duplicated playlist → "${manifest.playlistName}"`,
    apiMethod: "PUT",
    apiPath: "v1/playlist/{newPlaylistId}",
    status: templateReady ? "planned" : "missing_prerequisite",
  });

  for (const row of playlistPreview) {
    if (row.kind === "template_inherit" && row.pcoCorrespondence) {
      ops.push({
        step: step++,
        action: "template_slot",
        label: `Place template item "${row.name}" (PCO: "${row.pcoCorrespondence}")`,
        detail: "Inherited from duplicated template at PCO service-order position.",
        status: templateReady ? "planned" : "blocked",
      });
      continue;
    }
    if (row.kind === "template_inherit") {
      continue;
    }
    ops.push({
      step: step++,
      action: "add_to_playlist",
      label: `Add song "${row.pcoTitle ?? row.name}" to playlist`,
      detail: row.key ? `Key: ${row.key}` : undefined,
      apiMethod: "POST",
      apiPath: "v1/playlist/{newPlaylistId}/items (library reference — endpoint TBD)",
      status: templateReady ? "planned" : "blocked",
    });
  }

  return ops;
}

function buildPlaylistPreview(
  manifest: SlideDeckManifest,
  templateItems: PpPlaylistItemRef[],
  libraryIndex: PpLibraryItemRef[],
): MockCommitPlaylistRow[] {
  const rows: MockCommitPlaylistRow[] = [];
  let position = 1;
  const emittedTemplateIds = new Set<string>();

  const pushTemplate = (
    item: PpPlaylistItemRef,
    opts?: { pcoTitle?: string; source?: string },
  ) => {
    if (emittedTemplateIds.has(item.id)) return;
    emittedTemplateIds.add(item.id);
    rows.push({
      position: position++,
      kind: "template_inherit",
      name: item.name,
      source: opts?.source ?? `Template: ${manifest.template.sourcePlaylistName}`,
      pcoCorrespondence: opts?.pcoTitle,
      pcoTitle: opts?.pcoTitle,
    });
  };

  const pushSong = (song: ManifestElement) => {
    const searchTerm = song.propresenterSearchHint ?? song.pcoTitle;
    const libraryMatch: LibraryMatchResult = libraryIndex.length
      ? matchLibraryItem(searchTerm, libraryIndex)
      : { status: "unchecked", searchTerm, note: "Library not scanned." };

    rows.push({
      position: position++,
      kind: "song_add",
      name: libraryMatch.item?.name ?? song.pcoTitle,
      source: "PCO plan → library match",
      libraryMatch,
      pcoTitle: song.pcoTitle,
      pcoOrder: song.order,
      key: song.key,
      artist: song.artist,
    });
  };

  if (templateItems.length === 0) {
    for (const el of manifest.elements) {
      if (el.playlistIntent === "include") pushSong(el);
    }
    return rows;
  }

  for (const item of templatePrefixBeforeWelcome(templateItems)) {
    pushTemplate(item, { source: "Template prefix (pre-welcome)" });
  }

  for (const el of manifest.elements) {
    if (el.playlistIntent === "include") {
      pushSong(el);
      continue;
    }

    if (el.skipReason !== "template_covered") continue;

    const correspondence =
      el.templateCorrespondence ?? resolveTemplateCorrespondence(el.pcoTitle, templateItems);

    if (correspondence.status === "matched" && correspondence.ppItemId) {
      const ppItem = findTemplateItemById(templateItems, correspondence.ppItemId);
      if (ppItem) {
        pushTemplate(ppItem, {
          pcoTitle: el.pcoTitle,
          source: `PCO "${el.pcoTitle}" → template`,
        });
      }
    }
  }

  for (const item of templateItems) {
    if (!emittedTemplateIds.has(item.id)) {
      pushTemplate(item, { source: "Template suffix (unchanged from duplicate)" });
    }
  }

  return rows;
}

function collectCorrespondences(manifest: SlideDeckManifest): MockCommitPlan["correspondences"] {
  return manifest.elements
    .filter((el) => el.templateCorrespondence)
    .map((el) => ({
      pcoTitle: el.pcoTitle,
      pcoOrder: el.order,
      ppItemName: el.templateCorrespondence?.ppItemName,
      status: el.templateCorrespondence?.status ?? "unknown",
      note: el.templateCorrespondence?.note,
    }));
}

export function buildMockCommitPlan(input: BuildMockCommitInput): MockCommitPlan {
  const songs = input.manifest.elements.filter((e) => e.playlistIntent === "include");
  const warnings: string[] = [];

  if (!input.propresenterConnected) {
    warnings.push("ProPresenter not connected — library matches and template items unavailable.");
  }
  if (input.manifest.template.sourceFound === false) {
    warnings.push(
      `Template playlist "${input.manifest.template.sourcePlaylistName}" was not found.`,
    );
  }
  if (input.templateItems.length === 0 && input.propresenterConnected) {
    warnings.push("Could not read template playlist items.");
  }

  const welcomeCorrespondence = input.manifest.elements.find((e) =>
    /^welcome$/i.test(e.pcoTitle),
  )?.templateCorrespondence;
  if (welcomeCorrespondence?.status === "not_found") {
    warnings.push(`PCO "Welcome" has no matching ProPresenter template item.`);
  }
  if (welcomeCorrespondence?.status === "ambiguous") {
    warnings.push(`PCO "Welcome" matches multiple template items: ${welcomeCorrespondence.note}`);
  }

  const unmatched = input.libraryIndex.length
    ? songs.filter((s) => {
        const m = matchLibraryItem(s.propresenterSearchHint ?? s.pcoTitle, input.libraryIndex);
        return m.status !== "found";
      })
    : songs;

  if (unmatched.length > 0 && input.libraryIndex.length > 0) {
    warnings.push(
      `${unmatched.length} song(s) have no confident library match: ${unmatched.map((s) => s.pcoTitle).join(", ")}`,
    );
  }

  const playlistPreview = buildPlaylistPreview(
    input.manifest,
    input.templateItems,
    input.libraryIndex,
  );

  return {
    dryRun: true,
    writesBlocked: true,
    planId: input.manifest.planId,
    playlistName: input.manifest.playlistName,
    templateSource: input.manifest.template.sourcePlaylistName,
    templateItemCount: input.templateItems.length,
    operations: buildOperations(input.manifest, playlistPreview),
    playlistPreview,
    correspondences: collectCorrespondences(input.manifest),
    warnings,
    propresenterConnected: input.propresenterConnected,
  };
}
