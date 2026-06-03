"use client";

type DriveCandidate = {
  id: string;
  name: string;
  priorityScore?: number;
  webViewLink?: string;
};

export type PcoScanOptionButton = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  priorityScore: number;
  pcoAttachmentId: string;
  pcoAttachmentName: string;
  tier: ScanTier;
};

type ScanTier = "green" | "yellow" | "red";

export function DriveCandidateButtons({
  candidates,
  selectedId,
  groupName,
  onSelect,
}: {
  candidates: DriveCandidate[];
  selectedId: string;
  groupName: string;
  onSelect: (id: string, name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={groupName}>
      {candidates.map((candidate) => {
        const active = selectedId === candidate.id;
        return (
          <button
            key={candidate.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(candidate.id, candidate.name)}
            className={`flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left text-xs ${
              active
                ? "border-amber-600 bg-amber-100 font-medium text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100"
                : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600"
            }`}
          >
            <span>{candidate.name}</span>
            {typeof candidate.priorityScore === "number" ? (
              <span className="font-normal text-zinc-500">Priority {candidate.priorityScore}</span>
            ) : null}
            {candidate.webViewLink ? (
              <a
                className="font-normal text-sky-700 underline dark:text-sky-300"
                href={candidate.webViewLink}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Open in Drive
              </a>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PcoScanOptionButtons({
  options,
  onSelect,
}: {
  options: PcoScanOptionButton[];
  onSelect: (option: PcoScanOptionButton) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="listbox" aria-label="PCO scan documents">
      {options.map((opt) => (
        <button
          key={opt.driveFileId}
          type="button"
          className="flex flex-col items-start gap-0.5 rounded-lg border border-zinc-200 bg-white p-2 text-left text-xs hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          onClick={() => onSelect(opt)}
        >
          <span className="font-medium">{opt.name}</span>
          <span className="text-zinc-500">
            {opt.tier.toUpperCase()} · priority {opt.priorityScore}
            {opt.pcoAttachmentName !== opt.name ? ` · via ${opt.pcoAttachmentName}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

export function PcoAttachmentVariantButtons({
  variants,
  selectedAttachmentId,
  onSelect,
}: {
  variants: Array<{ attachmentId: string; name: string; tier: string }>;
  selectedAttachmentId?: string;
  onSelect: (attachmentId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="PCO scan source">
      {variants.map((variant) => {
        const active = selectedAttachmentId === variant.attachmentId;
        return (
          <button
            key={variant.attachmentId}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(variant.attachmentId)}
            className={`flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left text-xs ${
              active
                ? "border-sky-600 bg-sky-100 font-medium text-sky-950 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-100"
                : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
            }`}
          >
            <span>{variant.name}</span>
            <span className="font-normal text-zinc-500">{variant.tier.toUpperCase()} tier</span>
          </button>
        );
      })}
    </div>
  );
}
