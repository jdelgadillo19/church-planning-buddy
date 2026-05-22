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
