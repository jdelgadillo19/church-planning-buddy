/** File-style date for output doc titles: 2026.05.24 */
export function formatPlanDateForTitle(input: string | null | undefined): string {
  if (!input?.trim()) return "";

  const iso = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}.${iso[2]}.${iso[3]}`;

  const long = input.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/i,
  );
  if (long) {
    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const month = String(monthNames.indexOf(long[1].toLowerCase()) + 1).padStart(2, "0");
    const day = String(Number(long[2])).padStart(2, "0");
    return `${long[3]}.${month}.${day}`;
  }

  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  }

  return "";
}

/** Format PCO plan date like sample: May 24th, 2026 */
export function formatPlanDateLikeSample(input: string | null | undefined): string {
  if (!input?.trim()) return "";

  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return formatFromDate(d);
  }

  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) return formatFromDate(new Date(parsed));

  return input.trim();
}

function formatFromDate(d: Date) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
}
