export function parseGoogleDriveUrl(url: string): { type: "file" | "folder"; id: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const docsDoc = trimmed.match(/docs\.google\.com\/document\/d\/([^/]+)/);
  if (docsDoc?.[1]) return { type: "file", id: docsDoc[1] };

  const sheets = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (sheets?.[1]) return { type: "file", id: sheets[1] };

  const presentation = trimmed.match(/docs\.google\.com\/presentation\/d\/([^/]+)/);
  if (presentation?.[1]) return { type: "file", id: presentation[1] };

  const fileMatch =
    trimmed.match(/\/file\/d\/([^/]+)/) ??
    trimmed.match(/[?&]id=([^&]+)/);
  if (fileMatch?.[1]) return { type: "file", id: fileMatch[1] };

  const folderMatch = trimmed.match(/\/folders\/([^/?]+)/);
  if (folderMatch?.[1]) return { type: "folder", id: folderMatch[1] };

  return null;
}

export function isGoogleDriveUrl(url: string) {
  return /drive\.google\.com|docs\.google\.com/.test(url);
}
