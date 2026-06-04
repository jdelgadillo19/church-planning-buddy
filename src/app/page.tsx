import Link from "next/link";
import { GoogleConnectionCard } from "@/components/google-connection-card";
import { TOOLS } from "@/lib/tools/registry";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Grapevine Prep</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ministry operations tools — each workflow stays in its own lane.
          </p>
        </header>

        <GoogleConnectionCard hint="Connect once for Get Ready Guide, Slide Deck publish, and Team Messaging." />

        <ul className="flex flex-col gap-4">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              {tool.status === "active" ? (
                <Link
                  href={tool.href}
                  className="block rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <ToolCardContent tool={tool} />
                </Link>
              ) : (
                <div
                  className="block rounded-xl border border-dashed border-zinc-200 bg-zinc-100/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/30"
                  aria-disabled
                >
                  <ToolCardContent tool={tool} comingSoon />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ToolCardContent({
  tool,
  comingSoon = false,
}: {
  tool: (typeof TOOLS)[number];
  comingSoon?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium">{tool.name}</h2>
        {comingSoon ? (
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Coming soon
          </span>
        ) : null}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</p>
    </div>
  );
}
