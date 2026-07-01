"use client";

type Props = {
  open: boolean;
  title: string;
  label: string;
  percent: number;
  detail?: string | null;
  indeterminate?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
};

export function SlideDeckProgressModal({
  open,
  title,
  label,
  percent,
  detail,
  indeterminate = false,
  onCancel,
  cancelLabel = "Cancel",
}: Props) {
  if (!open) return null;

  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slide-deck-progress-title"
      aria-busy="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h2 id="slide-deck-progress-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
        {detail ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{detail}</p>
        ) : null}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          {indeterminate ? (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-violet-600 dark:bg-violet-500" />
          ) : (
            <div
              className="h-full rounded-full bg-violet-600 transition-[width] duration-300 dark:bg-violet-500"
              style={{ width: `${clamped}%` }}
            />
          )}
        </div>
        {!indeterminate ? (
          <p className="mt-2 text-right text-xs tabular-nums text-zinc-500">{clamped}%</p>
        ) : null}
        {onCancel ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {cancelLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
