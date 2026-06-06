import { NextResponse } from "next/server";
import {
  effectiveTemplateAlias,
  isAliasConfigured,
  listUnconfiguredAliasKeys,
  loadRosterPositionMap,
  ROSTER_ALIAS_PLACEHOLDER,
  resolveTemplateAlias,
  stripTeamPrefix,
} from "@/lib/pco/roster-position-map";
import { saveRosterPositionMap } from "@/lib/pco/roster-position-map-io";

export async function GET() {
  try {
    const map = loadRosterPositionMap();
    const unconfigured = listUnconfiguredAliasKeys(map);

    const entries = Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((pcoPosition) => ({
        pcoPosition,
        mapValue: map[pcoPosition],
        effectiveAlias: effectiveTemplateAlias(pcoPosition, map),
        configured: isAliasConfigured(map[pcoPosition]),
        strippedDefault: stripTeamPrefix(pcoPosition),
        resolvedLabel: resolveTemplateAlias(pcoPosition, map),
      }));

    return NextResponse.json({
      ok: true,
      map,
      entries,
      unconfigured,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load roster map.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { aliases?: Record<string, string> };
    const aliases = body.aliases ?? {};
    if (Object.keys(aliases).length === 0) {
      return NextResponse.json({ ok: false, error: "No aliases provided." }, { status: 400 });
    }

    const current = loadRosterPositionMap();
    const next = { ...current };

    for (const [pcoPosition, alias] of Object.entries(aliases)) {
      const key = pcoPosition.trim();
      const value = alias.trim();
      if (!key) continue;
      if (!value || value === ROSTER_ALIAS_PLACEHOLDER) continue;
      next[key] = value;
    }

    saveRosterPositionMap(next);

    return NextResponse.json({
      ok: true,
      map: next,
      unconfigured: listUnconfiguredAliasKeys(next),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save roster map.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
