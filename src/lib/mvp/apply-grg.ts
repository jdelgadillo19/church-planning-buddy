import {
  applyTemplateGrgUpdate,
  isTemplateValidationBlocking,
  validateGrgTemplate,
  type GrgTemplateValidationResult,
} from "@/lib/docs/grg-template";
import { applyScanColumns, importScanSection } from "@/lib/docs/scan-import";
import {
  captureScanStyleSpec,
  removeScanStyleExemplars,
  type ScanStyleSpec,
} from "@/lib/docs/scan-style-template";
import { resolveGrgOutputTitle, resolveGrgTemplateRef } from "@/lib/config/grg";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { createFetchDocsClient } from "@/lib/google/docs-fetch";
import type { drive_v3 } from "@/lib/google/api-types";
import { recreateOutputFromTemplateFetch } from "@/lib/google/drive-fetch";
import { resolveGrgOutputFolderId } from "@/lib/google/grg-drive-folders";
import { resolveTemplateDoc } from "@/lib/google/grg-resolve";
import type { PlanRosterRow } from "@/lib/pco/plan-team";
import { resolveGrgSection } from "@/lib/pco/roster-team-scope";
import type { MvpApplyPayload } from "@/lib/mvp/types";

export type ApplyGrgBody = MvpApplyPayload & {
  confirmed?: boolean;
  templateTitle?: string;
  templateId?: string;
};

export type ApplyInitResult = {
  grg: { id: string; name: string; webViewLink?: string };
  template: { id: string; name: string; webViewLink?: string };
  scanStyleSpec: ScanStyleSpec;
  result: Awaited<ReturnType<typeof applyTemplateGrgUpdate>>;
  errors: string[];
};

export type ApplyScanSongInput = {
  itemId: string;
  title: string;
  skipped: boolean;
  selectedFileId?: string;
};

export function rosterFromPayload(body: MvpApplyPayload): PlanRosterRow[] {
  return (body.roster ?? []).map((r, i) => ({
    teamMemberId: r.teamMemberId ?? `payload-${i}`,
    personId: r.teamMemberId ?? `payload-${i}`,
    displayName: r.displayName,
    pcoPositionName: r.pcoPositionName,
    positionName: r.positionName,
    teamName: r.teamName,
    grgSection: r.grgSection ?? resolveGrgSection(r.pcoPositionName, r.teamName),
    status: r.status,
  }));
}

export function applySongsToImport(body: MvpApplyPayload): ApplyScanSongInput[] {
  return (body.songs ?? []).filter((s) => !s.skipped && s.selectedFileId);
}

export function hasScansToApply(body: MvpApplyPayload): boolean {
  return applySongsToImport(body).length > 0;
}

export async function loadTemplateValidation(
  tokens: GoogleTokens,
  templateId: string,
): Promise<GrgTemplateValidationResult> {
  return validateGrgTemplate(tokens, templateId);
}

export function isApplyTemplateBlocking(
  templateValidation: GrgTemplateValidationResult,
  body: MvpApplyPayload,
): boolean {
  const skipIntro = Boolean(body.skipIntro);
  const skipScans = !hasScansToApply(body) || Boolean(body.skipScans);
  return isTemplateValidationBlocking(templateValidation, {
    skipIntro,
    skipScans,
    hasScansToApply: hasScansToApply(body),
  });
}

export function collectRosterSlotErrors(templateValidation: GrgTemplateValidationResult): string[] {
  return templateValidation.issues
    .filter((i) => i.code === "missing_roster_slot")
    .map((i) => i.message);
}

export async function runApplyInit(
  tokens: GoogleTokens,
  drive: drive_v3.Drive,
  body: ApplyGrgBody,
): Promise<ApplyInitResult> {
  const templateRef = resolveGrgTemplateRef({
    templateTitle: body.templateTitle,
    templateId: body.templateId,
  });
  const outputTitle = resolveGrgOutputTitle({ grgDocTitle: body.grgDocTitle });
  const docs = createFetchDocsClient(tokens);
  const template = await resolveTemplateDoc(tokens, drive, templateRef);

  const skipIntro = Boolean(body.skipIntro);
  const skipScans = !hasScansToApply(body) || Boolean(body.skipScans);

  const outputFolderId = await resolveGrgOutputFolderId(drive);
  const output = await recreateOutputFromTemplateFetch(
    tokens,
    template.id,
    outputTitle,
    outputFolderId,
  );

  const errors: string[] = [];
  const { spec: scanStyleSpec, missing: missingStyleTokens } = await captureScanStyleSpec(
    docs,
    output.id,
  );
  await removeScanStyleExemplars(docs, output.id);
  if (missingStyleTokens.length > 0) {
    errors.push(
      `Template missing scan style exemplars (used defaults): ${missingStyleTokens
        .map((t) => `{{STYLE_${t.toUpperCase()}}}`)
        .join(", ")}.`,
    );
  }

  const result = await applyTemplateGrgUpdate(docs, output.id, {
    dateFormatted: body.dateFormatted,
    songList: body.songList,
    sections: [],
    roster: rosterFromPayload(body),
    rosterSelections: body.rosterSelections,
    skipIntro,
    skipScans,
  });

  return {
    grg: { id: output.id, name: output.name, webViewLink: output.webViewLink },
    template: { id: template.id, name: template.name, webViewLink: template.webViewLink },
    scanStyleSpec,
    result,
    errors,
  };
}

export async function runApplyScan(
  tokens: GoogleTokens,
  drive: drive_v3.Drive,
  input: {
    grgDocId: string;
    scanStyleSpec: ScanStyleSpec;
    song: ApplyScanSongInput;
    isFirstScan: boolean;
  },
): Promise<{ mode: string; warning?: string }> {
  const docs = createFetchDocsClient(tokens);
  return importScanSection(
    tokens,
    docs,
    drive,
    input.grgDocId,
    input.song.selectedFileId!,
    input.song.title,
    !input.isFirstScan,
    input.scanStyleSpec,
  );
}

export async function runApplyColumns(
  tokens: GoogleTokens,
  grgDocId: string,
  scanStyleSpec: ScanStyleSpec,
): Promise<void> {
  const docs = createFetchDocsClient(tokens);
  await applyScanColumns(docs, grgDocId, scanStyleSpec);
}
