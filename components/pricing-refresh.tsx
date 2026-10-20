"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// A small status request detects new cloud snapshots without downloading the
// entire page each minute. refresh() preserves the explorer's filter state.
export function PricingRefresh({ generatedAt, sha256, publicationStatus, stale }: { generatedAt: string; sha256: string; publicationStatus: string; stale: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  useEffect(() => {
    let running = false;
    let disposed = false;
    const controller = new AbortController();
    async function check() {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        const response = await fetch("/api/pricing/status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) return;
        const status = await response.json();
        if (!disposed && typeof status.generatedAt === "string" &&
          (status.generatedAt !== generatedAt || status.publication?.sha256 !== sha256 || status.publication?.status !== publicationStatus || status.publication?.stale !== stale)) {
          startTransition(() => router.refresh());
        }
      } catch {
        // Keep the currently rendered snapshot during a network interruption.
      } finally {
        running = false;
      }
    }
    const interval = window.setInterval(check, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [generatedAt, sha256, publicationStatus, stale, router, startTransition]);
  return <meta name="rackrate-pricing-snapshot" content={sha256} />;
}
