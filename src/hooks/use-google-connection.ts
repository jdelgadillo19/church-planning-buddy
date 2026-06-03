"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type GoogleConnectionState = {
  connected: boolean;
  scopes: string[];
  loading: boolean;
};

async function fetchGoogleStatus(): Promise<{ connected: boolean; scopes: string[] }> {
  const res = await fetch("/api/auth/google/status");
  const data = (await res.json()) as { connected?: boolean; scopes?: string[] };
  return {
    connected: Boolean(data.connected),
    scopes: data.scopes ?? [],
  };
}

export function useGoogleConnection() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GoogleConnectionState>({
    connected: false,
    scopes: [],
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const status = await fetchGoogleStatus();
      setState({ ...status, loading: false });
    } catch {
      setState({ connected: false, scopes: [], loading: false });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const status = await fetchGoogleStatus();
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- status fetch on mount / OAuth return
        setState({ ...status, loading: false });
      } catch {
        if (!cancelled) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- status fetch on mount / OAuth return
          setState({ connected: false, scopes: [], loading: false });
        }
      }

      if (typeof window === "undefined" || cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const google = params.get("google");
      if (google !== "connected" && google !== "missing_code") return;

      try {
        const status = await fetchGoogleStatus();
        if (!cancelled) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- status fetch after OAuth return
          setState({ ...status, loading: false });
        }
      } catch {
        if (!cancelled) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- status fetch after OAuth return
          setState({ connected: false, scopes: [], loading: false });
        }
      }

      params.delete("google");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
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
