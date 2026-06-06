import { NextResponse } from "next/server";
import { decodeOAuthState, sanitizeGoogleErrorParam } from "@/lib/google/oauth-return";
import { googleOAuthRedirectUri } from "@/lib/google/auth";
import { exchangeGoogleOAuthCode } from "@/lib/google/oauth-exchange";
import { saveGoogleTokensForUser, loadGoogleTokensForUser } from "@/lib/google/token-store";
import { createClientFromRequestIfConfigured } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import {
  googleConnected,
  loadTokensForCurrentSession,
  saveTokensForCurrentSession,
} from "../_session";

function redirectWithSaveFailure(dest: URL, error: string) {
  dest.searchParams.set("google", "save_failed");
  dest.searchParams.set("google_error", sanitizeGoogleErrorParam(error));
  return NextResponse.redirect(dest);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const decoded = decodeOAuthState(url.searchParams.get("state"));
  const returnTo = decoded.returnTo;

  if (!code) {
    const missing = new URL(returnTo, url.origin);
    missing.searchParams.set("google", "missing_code");
    return NextResponse.redirect(missing);
  }

  let userId = decoded.userId;
  if (!userId) {
    const supabase = createClientFromRequestIfConfigured(req);
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    }
  }

  const dest = new URL(returnTo, url.origin);
  const redirectUri = googleOAuthRedirectUri(url.origin);

  let tokenPayload;
  try {
    tokenPayload = await exchangeGoogleOAuthCode(code, redirectUri);
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    console.error("[google/callback] token exchange failed:", message, { redirectUri });
    return redirectWithSaveFailure(dest, `token_exchange: ${message}`);
  }

  if (!isGrapevineAuthEnabled()) {
    const saveResult = await saveTokensForCurrentSession(tokenPayload, { replace: true });
    if (!saveResult.saved) {
      console.error("[google/callback] legacy token save failed:", saveResult.error);
      return redirectWithSaveFailure(dest, saveResult.error ?? "save_failed");
    }
    const stored = await loadTokensForCurrentSession();
    if (googleConnected(stored)) {
      dest.searchParams.set("google", "connected");
    } else {
      return redirectWithSaveFailure(dest, "load_after_save_failed");
    }
    return NextResponse.redirect(dest);
  }

  if (!userId) {
    return redirectWithSaveFailure(dest, "no_user");
  }

  const saveResult = await saveGoogleTokensForUser(userId, tokenPayload, { replace: true });

  if (!saveResult.saved) {
    console.error("[google/callback] token save failed:", saveResult.error);
    return redirectWithSaveFailure(dest, saveResult.error ?? "save_failed");
  }

  const stored = await loadGoogleTokensForUser(userId);
  if (googleConnected(stored)) {
    dest.searchParams.set("google", "connected");
  } else {
    return redirectWithSaveFailure(dest, "load_after_save_failed");
  }
  return NextResponse.redirect(dest);
}
