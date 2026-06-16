import { RIG_DOWNLOAD_PATHS } from "@/lib/grapevine-rig-downloads";

export function RigDownloadLinks() {
  return (
    <section className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Presentation rig
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Install Grapevine Rig on the sanctuary computer to apply slide decks and scan your
        ProPresenter library.
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
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
            Requires Node.js 20+ on PATH for apply and scan.
          </span>
        </li>
      </ul>
    </section>
  );
}
