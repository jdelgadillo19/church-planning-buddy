import type { SlideDeckSubmissionRow } from "@/lib/pp-platform/types";
import { buildServicePackageKey } from "@/lib/slide-deck/service-package-key";
import type { drive_v3 } from "@/lib/google/api-types";
import { publishHandoffPackage } from "./publish-handoff-package";

export type ServicesHandoffResult = {
  queued: boolean;
  packageId?: string;
  driveFolderUrl?: string;
  message: string;
};

export type ServicesHandoffPublishInput = {
  handoff: SlideDeckSubmissionRow;
  drive?: drive_v3.Drive;
  proplaylistBytes?: Buffer;
  proplaylistFileName?: string;
  publishedBy?: string;
};

/**
 * M3 bridge: publish Services/{date}/ package for a complete handoff.
 */
export async function queueServicesHandoffPublish(
  input: ServicesHandoffPublishInput,
): Promise<ServicesHandoffResult> {
  const handoff = input.handoff;
  const layout = (process.env.GV_DRIVE_LAYOUT ?? "legacy").trim().toLowerCase();

  const serviceKey = buildServicePackageKey(handoff.commit_plan.serviceDate ?? null);
  const packageId = `${serviceKey}/complete-handoff-${handoff.id.slice(0, 8)}`;

  if (!input.drive || !input.proplaylistBytes?.length) {
    if (layout === "legacy") {
      return {
        queued: false,
        packageId,
        message:
          "Handoff saved. Export .proplaylist on upload complete, or set GV_DRIVE_LAYOUT=dual|v1 with Services/ folders for auto-publish.",
      };
    }
    return {
      queued: false,
      packageId,
      message:
        "Handoff saved without Drive package — .proplaylist bytes required for Services/ publish.",
    };
  }

  const published = await publishHandoffPackage({
    drive: input.drive,
    handoff,
    proplaylistBytes: input.proplaylistBytes,
    proplaylistFileName: input.proplaylistFileName,
    publishedBy: input.publishedBy,
  });

  return {
    queued: true,
    packageId: published.packageId,
    driveFolderUrl: published.driveFolderUrl,
    message: `Services handoff published (${published.packageId}). Rig gatekeeper will pull when ready.`,
  };
}
