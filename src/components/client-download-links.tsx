import { RIG_DOWNLOAD_PATHS } from "@/lib/grapevine-rig-downloads";

export function ClientDownloadLinks({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={
        compact
          ? "rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/40"
          : "mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800"
      }
    >
      <h2
        className={
          compact
            ? "font-medium text-violet-950 dark:text-violet-100"
            : "text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        }
      >
        Grapevine Client
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Install the local client for remote prep workstations and presentation-rig tools.
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        <li>
          <a
            href={RIG_DOWNLOAD_PATHS.macos}
            className="font-medium text-violet-700 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Download for macOS
          </a>
        </li>
        <li>
          <a
            href={RIG_DOWNLOAD_PATHS.windows}
            className="font-medium text-violet-700 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Download for Windows
          </a>
          <span className="mt-0.5 block text-xs text-zinc-500">
            Remote Prep is the default workflow. Presentation-rig pairing and scan tools live in
            Advanced settings.
          </span>
        </li>
      </ul>
    </section>
  );
}
