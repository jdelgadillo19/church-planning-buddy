import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { ClientDownloadLinks } from "@/components/client-download-links";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { userHasOrgAccess } from "@/lib/supabase/membership";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

type PageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;

  if (!isGrapevineAuthEnabled()) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-xl font-semibold">Grapevine Prep</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Auth is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> for hosted mode, or run locally
          without those variables.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm underline">
          Back to tools
        </Link>
      </div>
    );
  }

  const supabase = await createClientIfConfigured();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && (await userHasOrgAccess(supabase, user.id))) {
      redirect(params.next?.startsWith("/") ? params.next : "/");
    }
  }

  const errorMessage =
    params.error === "not_invited"
      ? "Your account is not on an organization allowlist yet. Contact your admin."
      : params.error === "auth"
        ? "Sign-in failed or expired. Try again with Google, or request a new email link."
        : null;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">
          Grapevine Prep
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Church planning tools for your team. Access is limited to invited members.
        </p>
      </header>
      {errorMessage ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {errorMessage}
        </p>
      ) : null}
      <LoginForm redirectTo={params.next} />
      <ClientDownloadLinks />
    </div>
  );
}
