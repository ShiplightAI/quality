"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes server-rendered analysis state with bounded exponential backoff. */
export function AnalysisAutoRefresh({ active }: { readonly active: boolean }): null {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const startedAt = Date.now();
    const maxDuration = 10 * 60 * 1_000;
    let delay = 3_000;
    let timer: number | undefined;
    const refresh = (): void => {
      router.refresh();
      delay = Math.min(delay * 2, 30_000);
      if (Date.now() - startedAt + delay <= maxDuration) {
        timer = window.setTimeout(refresh, delay);
      }
    };

    timer = window.setTimeout(refresh, delay);
    return () => window.clearTimeout(timer);
  }, [active, router]);

  return null;
}
