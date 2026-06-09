/** User-facing note when Drive publish fails after a successful ProPresenter apply. */
export function softenPublishWarning(raw: string): string {
  const msg = raw.trim();
  if (!msg) {
    return "Drive publish was skipped; playlist is ready in ProPresenter.";
  }
  if (/assistive access|-2700/i.test(msg)) {
    return "Drive publish was skipped; playlist is ready in ProPresenter.";
  }
  if (msg.startsWith("Drive publish was skipped")) {
    return msg;
  }
  return `Drive publish was skipped: ${msg}`;
}
