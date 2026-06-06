"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type GoogleConnectionState = {
  connected: boolean;
  scopes: string[];
  loading: boolean;
  reauthRequired: boolean;
  saveFailed: boolean;
  saveError: string | null;
  hasRefreshToken: boolean;
  hasDriveScope: boolean;
  storedHasDriveScope: boolean;
  driveProbeOk: boolean;
  adminConfigured: boolean;
};

type GoogleStatusResponse = {
  connected?: boolean;
  scopes?: string[];
  hasRefreshToken?: boolean;
  hasDriveScope?: boolean;
  storedHasDriveScope?: boolean;
  driveProbeOk?: boolean;
  adminConfigured?: boolean;
};

const OAUTH_RETURN_PARAMS = new Set([
  "connected",
  "missing_code",
  "reauth_required",
  "save_failed",
]);

function readSaveErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("google") !== "save_failed") return null;
  return params.get("google_error");
}

async function fetchGoogleStatus(): Promise<
  Omit<GoogleConnectionState, "loading" | "reauthRequired" | "saveFailed" | "saveError">
> {
  const res = await fetch("/api/auth/google/status");
  const data = (await res.json()) as GoogleStatusResponse;
  return {
    connected: Boolean(data.connected),
    scopes: data.scopes ?? [],
    hasRefreshToken: Boolean(data.hasRefreshToken),
    storedHasDriveScope: Boolean(data.storedHasDriveScope ?? data.hasDriveScope),
    driveProbeOk: Boolean(data.driveProbeOk),
    hasDriveScope: Boolean(data.hasDriveScope),
    adminConfigured: Boolean(data.adminConfigured),
  };
}

export function useGoogleConnection() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GoogleConnectionState>({
    connected: false,
    scopes: [],
    loading: true,
    reauthRequired: false,
    saveFailed: false,
    saveError: null,
    hasRefreshToken: false,
    hasDriveScope: false,
    storedHasDriveScope: false,
    driveProbeOk: false,
    adminConfigured: false,
  });

  const refresh = useCallback(async () => {
    try {
      const status = await fetchGoogleStatus();
      setState({
        ...status,
        loading: false,
        reauthRequired: false,
        saveFailed: false,
        saveError: null,
      });
    } catch {
      setState({
        connected: false,
        scopes: [],
        loading: false,
        reauthRequired: false,
        saveFailed: false,
        saveError: null,
        hasRefreshToken: false,
        hasDriveScope: false,
        storedHasDriveScope: false,
        driveProbeOk: false,
        adminConfigured: false,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const params =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const googleParam = params?.get("google") ?? null;
      const googleError = readSaveErrorFromUrl();
      const oauthReturn = googleParam != null && OAUTH_RETURN_PARAMS.has(googleParam);

      try {
        const status = await fetchGoogleStatus();
        if (cancelled) return;
        setState({
          ...status,
          loading: false,
          reauthRequired: googleParam === "reauth_required",
          saveFailed:
            googleParam === "save_failed" ||
            (googleParam === "connected" && !status.connected),
          saveError: googleError,
        });
      } catch {
        if (!cancelled) {
          setState({
            connected: false,
            scopes: [],
            loading: false,
            reauthRequired: googleParam === "reauth_required",
            saveFailed: googleParam === "save_failed",
            saveError: googleError,
            hasRefreshToken: false,
            hasDriveScope: false,
            storedHasDriveScope: false,
            driveProbeOk: false,
            adminConfigured: false,
          });
        }
      }

      if (oauthReturn && params && typeof window !== "undefined" && !cancelled) {
        try {
          const status = await fetchGoogleStatus();
          if (!cancelled) {
            setState({
              ...status,
              loading: false,
              reauthRequired: googleParam === "reauth_required",
              saveFailed:
                googleParam === "save_failed" ||
                (googleParam === "connected" && !status.connected),
              saveError: googleError,
            });
          }
        } catch {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              loading: false,
              reauthRequired: googleParam === "reauth_required",
              saveFailed: googleParam === "save_failed",
              saveError: googleError,
            }));
          }
        }

        params.delete("google");
        params.delete("google_error");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const connectHref = `/api/auth/google/start?returnTo=${encodeURIComponent(pathname)}`;

  const disconnect = useCallback(async () => {
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    await refresh();
  }, [refresh]);

  return { ...state, refresh, connectHref, disconnect };
}

export function googleSaveErrorMessage(
  saveError: string | null,
  adminConfigured: boolean,
): string {
  if (!saveError) {
    return adminConfigured
      ? "Google authorized but tokens could not be saved to the server."
      : "Google authorized but tokens could not be saved — SUPABASE_SERVICE_ROLE_KEY may be missing on the Worker.";
  }
  if (saveError === "no_user") {
    return "Could not match your CPB login to the Google callback (no_user). Sign in to CPB first, then Connect Google from the same browser tab.";
  }
  if (saveError === "admin_not_configured") {
    return "Server cannot write to Supabase (admin_not_configured). Check SUPABASE_SERVICE_ROLE_KEY on the Cloudflare Worker.";
  }
  if (saveError === "load_after_save_failed") {
    return "Tokens were saved but could not be read back. Try Connect Google once more.";
  }
  if (saveError === "token_exchange_empty" || saveError === "token_response_empty") {
    return "Google authorized the app but returned no tokens. Try Connect Google again.";
  }
  if (saveError.startsWith("token_exchange:")) {
    return `Google token exchange failed (${saveError.replace(/^token_exchange:\s*/, "")}). Check GOOGLE_REDIRECT_URI matches Google Cloud and retry Connect Google.`;
  }
  if (saveError === "no_tokens") {
    return "Google returned no usable tokens. Try Connect Google again (approve all permissions).";
  }
  return `Token save failed: ${saveError}`;
}
