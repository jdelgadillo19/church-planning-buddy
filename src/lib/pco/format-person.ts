export type PersonNameFields = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
};

/** Template convention: First-name Last Initial (e.g. Jordan D.) */
export function formatPersonShortName(person: PersonNameFields): string {
  const first = (person.first_name ?? "").trim();
  const last = (person.last_name ?? "").trim();

  if (first && last) {
    const initial = last[0]?.toUpperCase() ?? "";
    return initial ? `${first} ${initial}.` : first;
  }

  if (first) return first;

  const full = (person.full_name ?? person.name ?? "").trim();
  if (!full) return "";

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  if (parts.length >= 2) {
    const f = parts[0];
    const l = parts[parts.length - 1];
    const initial = l[0]?.toUpperCase() ?? "";
    return initial ? `${f} ${initial}.` : f;
  }

  return full;
}
