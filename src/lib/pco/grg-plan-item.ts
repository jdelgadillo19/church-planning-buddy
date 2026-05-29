import { pcoGetJsonOrThrow } from "./client";
import { GRG_PCO_ITEM_TITLE } from "./grg-pdf-filename";

export type GrgPlanItem = {
  id: string;
  title: string;
};

type PcoItemRow = {
  id?: string;
  attributes?: { title?: string | null };
};

export async function findGrgPlanItem(
  serviceTypeId: number,
  planId: number,
  auth: string,
): Promise<GrgPlanItem> {
  const url = `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/items?per_page=100`;
  const json = await pcoGetJsonOrThrow(url, auth);
  const rows = (json as { data?: PcoItemRow[] }).data ?? [];
  const target = GRG_PCO_ITEM_TITLE.trim().toLowerCase();

  const matches = rows.filter((row) => {
    const title = (row.attributes?.title ?? "").trim().toLowerCase();
    return title === target && row.id;
  });

  if (matches.length === 0) {
    throw new Error(
      `No plan item titled "${GRG_PCO_ITEM_TITLE}" found on this service plan. Add that item in Planning Center first.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple plan items titled "${GRG_PCO_ITEM_TITLE}" found. Leave exactly one on the service plan.`,
    );
  }

  const row = matches[0]!;
  return {
    id: row.id!,
    title: (row.attributes?.title ?? GRG_PCO_ITEM_TITLE).trim(),
  };
}
