import type { PcoItemTime, ServiceOrderItem } from "@/lib/slide-deck/types";

/** Map PCO section header titles to pre/post service timing. */
export function sectionTimeFromHeaderTitle(title: string): PcoItemTime | null {
  const normalized = title.trim().toLowerCase();
  if (/^pre[-\s]?service\b/.test(normalized)) return "pre";
  if (/^post[-\s]?service\b/.test(normalized)) return "post";
  return null;
}

/**
 * When PCO leaves items as `during` but places them under Pre/Post-Service headers,
 * infer timing from header order so pre-service openers and post-service media are included.
 */
export function applyServiceSectionTimes(items: ServiceOrderItem[]): ServiceOrderItem[] {
  let section: PcoItemTime = "during";

  return items.map((item) => {
    const itemType = item.itemType.trim().toLowerCase();

    if (itemType === "header") {
      const fromHeader = sectionTimeFromHeaderTitle(item.title);
      section = fromHeader ?? "during";
      return item;
    }

    if (section === "pre" || section === "post") {
      if (item.time === section) return item;
      return { ...item, time: section };
    }

    return item;
  });
}
