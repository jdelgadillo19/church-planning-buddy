/** Detect UTF-8 mis-decoded zip/gzip payloads masquerading as printable text. */
export function looksLikeBinaryPayload(text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 8);
  // gzip magic
  if (head.charCodeAt(0) === 0x1f && head.charCodeAt(1) === 0x8b) return true;
  // zip magic (PK) or mis-decoded shift (RPPJ)
  if (head.startsWith("PK") || head.startsWith("RPPJ")) return true;
  if (text.includes("RPPJ") || text.includes("PK\u0003\u0004")) return true;
  // replacement chars from invalid UTF-8
  if (text.includes("\uFFFD") && text.length < 500) return true;
  // high ratio of non-letter/digit/punctuation space
  const sample = text.slice(0, 120);
  let weird = 0;
  for (const ch of sample) {
    const c = ch.charCodeAt(0);
    const normal =
      (c >= 0x20 && c <= 0x7e) &&
      /[A-Za-z0-9 .,;:'"!?()\-_/\\@#$%&*+=\[\]{}]/.test(ch);
    if (!normal) weird++;
  }
  return weird > sample.length * 0.25;
}

/** Never show raw binary / gzip bytes in the UI. */
export function sanitizeErrorMessage(message: string, maxLen = 240): string {
  if (looksLikeBinaryPayload(message)) {
    return "Filebase pull failed — server returned a file instead of an error message. Hard-refresh and try again.";
  }
  const cleaned = message
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Filebase pull failed.";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}
