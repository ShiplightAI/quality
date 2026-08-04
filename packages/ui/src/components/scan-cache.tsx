"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import type { ObservationSourceProfileEnvStatus, ScanResult } from "@shiplightai/quality-core";

// Per-project scan cache (spec 045). Mounted in the QC layout, which persists across its child
// routes (overview / reviews / explorer), so a scan of a given project is reused when the user
// navigates between those pages instead of re-running on every mount. Keyed by the project's
// stable `projectKey`; a manual Scan/Refresh overwrites the entry. Session-scoped (a ref, not
// storage) — cleared on full reload, which is the natural "get fresh data" gesture.
export interface CachedScan {
  readonly result: ScanResult;
  readonly observationSourceEnv: readonly ObservationSourceProfileEnvStatus[];
}

interface QcScanCache {
  get(projectKey: string): CachedScan | undefined;
  set(projectKey: string, value: CachedScan): void;
  // Drop a project's cached scan (or all, when no key) after a draft mutation (save/publish/discard)
  // so a subsequent ProjectScanner page re-scans instead of showing the pre-mutation snapshot.
  invalidate(projectKey?: string): void;
}

const QcScanCacheContext = createContext<QcScanCache | null>(null);

export function QcScanCacheProvider({ children }: { readonly children: ReactNode }): React.ReactElement {
  const store = useRef<Map<string, CachedScan>>(new Map());
  const cacheRef = useRef<QcScanCache>({
    get: (key) => store.current.get(key),
    set: (key, value) => {
      store.current.set(key, value);
    },
    invalidate: (key) => {
      if (key === undefined) store.current.clear();
      else store.current.delete(key);
    },
  });
  return <QcScanCacheContext.Provider value={cacheRef.current}>{children}</QcScanCacheContext.Provider>;
}

/** The QC scan cache, or null when rendered outside the provider (defensive — treat as no cache). */
export function useQcScanCache(): QcScanCache | null {
  return useContext(QcScanCacheContext);
}
