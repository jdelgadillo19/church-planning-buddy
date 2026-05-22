import { parseGoogleDriveUrl } from "./drive-url";

const cases: Array<[string, string | null]> = [
  ["https://drive.google.com/file/d/FILE_ID/view", "FILE_ID"],
  ["https://drive.google.com/open?id=FILE_ID", "FILE_ID"],
  ["https://drive.google.com/drive/folders/FOLDER_ID", "FOLDER_ID"],
  ["https://docs.google.com/document/d/DOC_ID/edit", "DOC_ID"],
  ["https://docs.google.com/spreadsheets/d/SHEET_ID/edit", "SHEET_ID"],
  ["https://example.com/not-drive", null],
];

for (const [url, expectedId] of cases) {
  const parsed = parseGoogleDriveUrl(url);
  const got = parsed?.id ?? null;
  if (got !== expectedId) {
    throw new Error(`parseGoogleDriveUrl(${url}) id=${got}, want ${expectedId}`);
  }
}

console.log("drive-url tests ok");
