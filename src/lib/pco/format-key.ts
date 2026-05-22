/** PCO Key pitch for GRG lines (e.g. "Ab", "C", "F#m") — not arrangement subtitle ("Original Key"). */
export function formatPitchKey(attrs: {
  starting_key?: string | null;
  starting_minor?: boolean | null;
  name?: string | null;
} | null | undefined): string {
  if (!attrs) return "";

  const pitch = attrs.starting_key?.trim();
  if (pitch) {
    if (attrs.starting_minor && !pitch.toLowerCase().endsWith("m")) return `${pitch}m`;
    return pitch;
  }

  const name = attrs.name?.trim() ?? "";
  if (!name) return "";

  const colon = name.indexOf(":");
  if (colon > 0) {
    const left = name.slice(0, colon).trim();
    if (/^[A-G](?:#|b)?m?$/i.test(left)) return left;
  }

  if (/^[A-G](?:#|b)?m?$/i.test(name)) return name;

  return "";
}

/** Item-level fallback when Key resource is not loaded. */
export function keyFromItemAttribute(keyName: string | null | undefined): string {
  const raw = keyName?.trim() ?? "";
  if (!raw) return "";

  const colon = raw.indexOf(":");
  if (colon > 0) {
    const left = raw.slice(0, colon).trim();
    if (/^[A-G](?:#|b)?m?$/i.test(left)) return left;
  }

  if (/^[A-G](?:#|b)?m?$/i.test(raw)) return raw;

  return "";
}
