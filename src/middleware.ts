import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isMachineBearerApiPath,
  isMachineBearerAuthorized,
} from "@/lib/auth/machine-bearer";
import { isRigMachineBypassRequest } from "@/lib/pp-platform/rig-auth";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

const PUBLIC_PREFIXES = ["/login", "/auth/"];
const GOOGLE_OAUTH_CALLBACK = "/api/auth/google/callback";

function isPublicPath(pathname: string): boolean {
  if (pathname === GOOGLE_OAUTH_CALLBACK) return false;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}`));
}

async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export async function middleware(request: NextRequest) {
  if (!isGrapevineAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Rig index upload + Mac agent poll (bearer token, no browser session).
  if (isMachineBearerApiPath(pathname) && isMachineBearerAuthorized(request)) {
    return NextResponse.next();
  }

  // Grapevine Rig app (pairing code exchange + rig-authenticated APIs).
  if (isRigMachineBypassRequest(request, pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const callback = new URL("/auth/callback", request.url);
    callback.search = request.nextUrl.search;
    return NextResponse.redirect(callback);
  }

  if (pathname === GOOGLE_OAUTH_CALLBACK) {
    return refreshSupabaseSession(request);
  }

  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    const returnPath = pathname + request.nextUrl.search;
    login.searchParams.set("next", returnPath);
    return NextResponse.redirect(login);
  }

  const { count, error } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (error || (count ?? 0) < 1) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "not_invited");
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
