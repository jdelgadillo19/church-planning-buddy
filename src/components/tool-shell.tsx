import Link from "next/link";
import type { ReactNode } from "react";
import { TOOLS, type ToolDefinition } from "@/lib/tools/registry";

type ToolShellProps = {
  toolId: string;
  title?: string;
  description?: string;
  children: ReactNode;
};

function toolNavClass(active: boolean): string {
  return active
    ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
    : "rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";
}

function ToolNavLink({ tool, active }: { tool: ToolDefinition; active: boolean }) {
  if (tool.status === "coming_soon") {
    return (
      <span
        className="cursor-not-allowed rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
        title="Coming soon"
      >
        {tool.name}
      </span>
    );
  }

  return (
    <Link href={tool.href} className={toolNavClass(active)}>
      {tool.name}
    </Link>
  );
}

export function ToolShell({ toolId, title, description, children }: ToolShellProps) {
  const tool = TOOLS.find((t) => t.id === toolId);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <Link
            href="/"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Church Planning Buddy
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {title ?? tool?.name ?? "Tool"}
            </h1>
            {(description ?? tool?.description) ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {description ?? tool?.description}
              </p>
            ) : null}
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Tools">
            {TOOLS.map((t) => (
              <ToolNavLink key={t.id} tool={t} active={t.id === toolId} />
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
