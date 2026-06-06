import { NextResponse } from "next/server";
import { buildAuthHeader, parsePositiveIntOrNull } from "@/lib/pco/client";
import { loadRosterPositionMap } from "@/lib/pco/roster-position-map";
import { saveRosterPositionMap } from "@/lib/pco/roster-position-map-io";
import { syncMapWithCatalog } from "@/lib/pco/roster-position-sync";
import {
  collectPositionNamesFromCatalog,
  loadServiceTypeTeamPositions,
} from "@/lib/pco/team-positions";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { serviceTypeId?: string | number };
    const serviceTypeId = parsePositiveIntOrNull(body.serviceTypeId);
    if (!serviceTypeId) {
      return NextResponse.json(
        { ok: false, error: "serviceTypeId required." },
        { status: 400 },
      );
    }

    const auth = buildAuthHeader();
    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Missing Planning Center auth in .env.local." },
        { status: 401 },
      );
    }

    const existing = loadRosterPositionMap();
    const { positions, teamsById } = await loadServiceTypeTeamPositions(serviceTypeId, auth);
    const catalogNames = collectPositionNamesFromCatalog(positions, teamsById);
    const { map, added } = syncMapWithCatalog(existing, catalogNames);

    saveRosterPositionMap(map);

    return NextResponse.json({
      ok: true,
      added,
      total: Object.keys(map).length,
      map,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Catalog sync failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
