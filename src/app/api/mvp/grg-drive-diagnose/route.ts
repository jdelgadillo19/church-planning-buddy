import { NextResponse } from "next/server";
import { resolveGrgTemplateRef } from "@/lib/config/grg";
import { resolveGrgDriveFolderRefs } from "@/lib/config/grg-drive";
import { driveListDocNamesInFolderFetch, resolveGoogleAccessToken } from "@/lib/google/drive-fetch";
import { probeGoogleDriveAccess } from "@/lib/google/drive-probe";
import { findDocByIdWithAccess } from "@/lib/google/drive-files";
import { hasDriveScopeInTokens } from "@/lib/google/token-store";
import {
  fetchGoogleTokenInfo,
  hasDriveFileScopeOnly,
  hasFullDriveScope,
  type GoogleTokenInfo,
} from "@/lib/google/token-info";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";

function maskId(id?: string): string | undefined {
  if (!id) return undefined;
  if (id.length <= 6) return id;
  return `…${id.slice(-4)}`;
}

function formatScopeSummary(scopes: string[]): string {
  if (scopes.length === 0) return "(none reported)";
  return scopes.map((s) => s.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "")).join(", ");
}

type AccessCheck = { code: number; message: string; name?: string };

export async function GET() {
  const tokens = await loadTokensForCurrentSession();
  const connected = googleConnected(tokens);
  const templateRef = resolveGrgTemplateRef();
  const folderRefs = resolveGrgDriveFolderRefs();

  let tokenInfo: GoogleTokenInfo = { scopes: [] };
  if (tokens?.access_token) {
    tokenInfo = await fetchGoogleTokenInfo(tokens.access_token);
  }

  const base = {
    ok: true as const,
    token: {
      connected,
      hasRefreshToken: Boolean(tokens?.refresh_token),
      storedHasDriveScope: hasDriveScopeInTokens(tokens),
      email: tokenInfo.email,
      liveScopes: tokenInfo.scopes,
      liveScopeSummary: formatScopeSummary(tokenInfo.scopes),
      hasFullDriveScope: hasFullDriveScope(tokenInfo.scopes),
      driveFileScopeOnly: hasDriveFileScopeOnly(tokenInfo.scopes),
    },
    env: {
      templateId: maskId(templateRef.id),
      templateIdLength: templateRef.id?.length ?? 0,
      templateFolderId: maskId(folderRefs.templateFolderId),
      templateTitle: templateRef.title,
    },
    driveProbe: connected
      ? ({ ok: false, code: 0, message: "Not probed" } as const)
      : ({ ok: false, code: 401, message: "Google Drive not connected." } as const),
    templateIdGet: templateRef.id
      ? ({ code: 0, message: "Not probed" } as AccessCheck)
      : ({ code: 0, message: "GRG_TEMPLATE_ID not configured on server." } as AccessCheck),
    templateFolderGet: folderRefs.templateFolderId
      ? ({ code: 0, message: "Not probed" } as AccessCheck)
      : ({
          code: 0,
          message: "GRG_TEMPLATE_FOLDER_ID not configured — using path walk at verify time.",
        } as AccessCheck),
    templateFolderDocs: { count: 0, names: [] as string[] },
  };

  if (!connected || !tokens) {
    return NextResponse.json(base);
  }

  const driveProbe = await probeGoogleDriveAccess(tokens);

  let templateIdGet = base.templateIdGet;
  if (templateRef.id) {
    const result = await findDocByIdWithAccess(tokens, templateRef.id);
    templateIdGet = result.ok
      ? { code: 200, message: "OK", name: result.doc.name }
      : { code: result.code, message: result.message };
  }

  let templateFolderGet = base.templateFolderGet;
  let templateFolderDocs = base.templateFolderDocs;
  const folderId = folderRefs.templateFolderId;

  if (folderId) {
    const folderResult = await findDocByIdWithAccess(tokens, folderId);
    templateFolderGet = folderResult.ok
      ? { code: 200, message: "OK", name: folderResult.doc.name }
      : { code: folderResult.code, message: folderResult.message };

    const accessToken = await resolveGoogleAccessToken(tokens);
    if (accessToken && folderResult.ok) {
      const names = await driveListDocNamesInFolderFetch(accessToken, folderId, 10);
      templateFolderDocs = { count: names.length, names };
    }
  }

  return NextResponse.json({
    ...base,
    driveProbe,
    templateIdGet,
    templateFolderGet,
    templateFolderDocs,
  });
}
