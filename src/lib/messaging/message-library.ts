import {
  MESSAGE_LIBRARY_COLUMNS,
  MESSAGING_SHEET_TAB,
  messagingSheetId,
} from "@/lib/config/messaging";
import { readSheetValues } from "@/lib/google/sheets";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import type { MessageLibraryRow, MessagingContext } from "./types";

function parseEnabled(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase();
}

export function parseMessageLibraryRows(rows: string[][]): {
  rows: MessageLibraryRow[];
  errors: string[];
} {
  const errors: string[] = [];
  if (rows.length === 0) {
    return { rows: [], errors: ["Sheet is empty"] };
  }

  const header = rows[0].map(normalizeHeader);
  const colIndex = new Map<string, number>();
  for (const name of MESSAGE_LIBRARY_COLUMNS) {
    const idx = header.indexOf(name.toLowerCase());
    if (idx < 0) errors.push(`Missing column: ${name}`);
    else colIndex.set(name, idx);
  }
  if (errors.length > 0) return { rows: [], errors };

  const parsed: MessageLibraryRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    if (!line?.some((c) => c?.trim())) continue;

    const get = (col: (typeof MESSAGE_LIBRARY_COLUMNS)[number]) =>
      (line[colIndex.get(col)!] ?? "").trim();

    const group = get("Group");
    const purpose = get("Purpose");
    const message = get("Message");
    if (!group || !purpose || !message) continue;

    parsed.push({
      group,
      purpose,
      context: get("Context") || "normal",
      variant: get("Variant") || "A",
      message,
      additional: get("Additional"),
      enabled: parseEnabled(get("Enabled") || "TRUE"),
    });
  }

  return { rows: parsed, errors };
}

export async function loadMessageLibrary(
  tokens: GoogleTokens,
): Promise<{ rows: MessageLibraryRow[]; errors: string[] }> {
  const sheetId = messagingSheetId();
  if (!sheetId) {
    return { rows: [], errors: ["MESSAGING_SHEET_ID is not set in .env.local"] };
  }

  const range = `${MESSAGING_SHEET_TAB}!A1:Z2000`;
  const raw = await readSheetValues(tokens, sheetId, range);
  return parseMessageLibraryRows(raw);
}

export function pickMessageVariant(
  library: MessageLibraryRow[],
  input: { group: string; purpose: string; context: MessagingContext },
): MessageLibraryRow | null {
  const groupKey = input.group.trim().toLowerCase();
  const purposeKey = input.purpose.trim().toLowerCase();
  const contextKey = input.context.trim().toLowerCase();

  const matches = library.filter(
    (r) =>
      r.enabled &&
      r.group.trim().toLowerCase() === groupKey &&
      r.purpose.trim().toLowerCase() === purposeKey &&
      r.context.trim().toLowerCase() === contextKey,
  );
  if (matches.length === 0) return null;
  return matches[Math.floor(Math.random() * matches.length)] ?? null;
}
