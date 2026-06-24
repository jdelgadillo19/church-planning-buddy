/** Never show raw binary / gzip bytes in the UI. */
export function sanitizeErrorMessage(message: string, maxLen = 240): string {
  const cleaned = message
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Filebase pull failed.";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}
