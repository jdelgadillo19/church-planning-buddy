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
  /** Set when target playlist name already exists in ProPresenter with items. */
  playlistConflict?: {
    playlistId: string;
    playlistName: string;
    itemCount: number;
  };
};

export type BuildMockCommitInput = {
  manifest: SlideDeckManifest;
  templateItems: PpPlaylistItemRef[];
  libraryIndex: PpLibraryItemRef[];
  propresenterConnected: boolean;
  /** True when library/template data came from cloud index snapshot. */
  useCloudIndex?: boolean;
  indexMeta?: {
    rigName: string;
    snapshotAt: string;
    stale: boolean;
  };
  playlistConflict?: MockCommitPlan["playlistConflict"];
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
      source:
        libraryMatch.status === "ambiguous"
          ? "PCO plan → pick library variant"
          : "PCO plan → library match",
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

  if (input.useCloudIndex && input.indexMeta) {
    const when = new Date(input.indexMeta.snapshotAt).toLocaleString();
    if (input.indexMeta.stale) {
      warnings.push(
        `Library index from ${input.indexMeta.rigName} is over 7 days old (${when}) — ask operator to sync Grapevine Rig.`,
      );
    } else if (input.libraryIndex.length > 0) {
      warnings.push(
        `Using library index from ${input.indexMeta.rigName} (updated ${when}).`,
      );
    } else {
      warnings.push(
        `Index from ${input.indexMeta.rigName} has no library entries — run index upload on the presentation Mac.`,
      );
    }
  } else if (!input.propresenterConnected) {
    warnings.push(
      "No ProPresenter connection or cloud index — library matches and template items unavailable.",
    );
  }
  if (input.manifest.template.sourceFound === false) {
    warnings.push(
      `Template playlist "${input.manifest.template.sourcePlaylistName}" was not found.`,
    );
  }
  if (
    input.templateItems.length === 0 &&
    (input.propresenterConnected || input.useCloudIndex) &&
    input.manifest.template.sourceFound !== false
  ) {
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

  const needsPick = input.libraryIndex.length
    ? songs.filter((s) => {
        const m = matchLibraryItem(s.propresenterSearchHint ?? s.pcoTitle, input.libraryIndex);
        return m.status === "ambiguous";
      })
    : [];

  if (needsPick.length > 0) {
    warnings.push(
      `${needsPick.length} song(s) need a library variant selected: ${needsPick.map((s) => s.pcoTitle).join(", ")}`,
    );
  }

  const unmatched = input.libraryIndex.length
    ? songs.filter((s) => {
        const m = matchLibraryItem(s.propresenterSearchHint ?? s.pcoTitle, input.libraryIndex);
        return m.status === "not_found";
      })
    : songs;

  if (unmatched.length > 0 && input.libraryIndex.length > 0) {
    warnings.push(
      `${unmatched.length} song(s) have no library match: ${unmatched.map((s) => s.pcoTitle).join(", ")}`,
    );
  }

  const playlistPreview = buildPlaylistPreview(
    input.manifest,
    input.templateItems,
    input.libraryIndex,
  );

  if (input.playlistConflict) {
    warnings.push(
      `Playlist "${input.playlistConflict.playlistName}" already exists in ProPresenter (${input.playlistConflict.itemCount} items). Apply will prompt for Overwrite, View, or Cancel.`,
    );
  }

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
    playlistConflict: input.playlistConflict,
  };
}
