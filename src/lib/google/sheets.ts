import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "./auth";

export async function readSheetValues(
  tokens: GoogleTokens,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const { sheets } = getAuthedClients(tokens);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rows = res.data.values;
  return Array.isArray(rows) ? (rows as string[][]) : [];
}
