"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import type {
  ObservationSourceProfileEnvStatus,
  ScanResult,
  TargetEvaluationSnapshot,
} from "@shiplightai/quality-core";

// Per-project scan cache (spec 045). Mounted in the QC layout, which persists across its child
// routes (overview / reviews / explorer), so a scan of a given project is reused when the user
// navigates between those pages instead of re-running on every mount. Keyed by the project's
// stable `projectKey`; a manual Scan/Refresh overwrites the entry. Session-scoped (a ref, not
// storage) — cleared on full reload, which is the natural "get fresh data" gesture.
export interface CachedScan {
  readonly result: ScanResult;
  readonly observationSourceEnv: readonly ObservationSourceProfileEnvStatus[];
}

/**
 * The last observation set a viewer ran for a project, so a feature page shows
 * runtime proof for that same set instead of asking again or re-running it.
 *
 * Cached rather than re-fetched because running a set is not free: a
 * github-actions source downloads artifacts over the network, and re-running it
 * on every feature page view would turn a navigation into a fetch. It is also
 * the only way the selection can be *inherited* — the run happens on the
 * scanner page, and the feature page has no picker of its own.
 *
 * The set id and name ride along because a feature page showing runtime state
 * must be able to say which set produced it; "observed" with no attribution is
 * a claim a reviewer cannot check. `viewId` rides along for the same reason:
 * a view-scoped run evaluates only the targets inside that view, so a feature
 * outside it has no snapshot for a reason the page must be able to state
 * instead of rendering an empty proof column that reads like a failure.
 */
export interface CachedRuntime {
  readonly observationSetId: string;
  readonly observationSetName: string;
  /** The saved view the run was scoped to, when it was scoped to one. */
  readonly viewId?: string;
  readonly evaluations: readonly { readonly targets: readonly TargetEvaluationSnapshot[] }[];
}

interface QcScanCache {
  get(projectKey: string): CachedScan | undefined;
  set(projectKey: string, value: CachedScan): void;
  getRuntime(projectKey: string): CachedRuntime | undefined;
  setRuntime(projectKey: string, value: CachedRuntime): void;
  // Drop only the runtime, keeping the scan — what a re-scan needs, since the fresh
  // structure is worth caching but the evaluation resolved onto the old one is not.
  clearRuntime(projectKey: string): void;
  // Drop a project's cached scan (or all, when no key) after a draft mutation (save/publish/discard)
  // so a subsequent ProjectScanner page re-scans instead of showing the pre-mutation snapshot.
  // Runtime goes with it: an evaluation is only meaningful against the structure it was resolved
  // onto, so keeping it across a re-scan could show proof against checks that have since changed.
  invalidate(projectKey?: string): void;
}

const QcScanCacheContext = createContext<QcScanCache | null>(null);

export function QcScanCacheProvider({ children }: { readonly children: ReactNode }): React.ReactElement {
  const store = useRef<Map<string, CachedScan>>(new Map());
  const runtimeStore = useRef<Map<string, CachedRuntime>>(new Map());
  const cacheRef = useRef<QcScanCache>({
    get: (key) => store.current.get(key),
    set: (key, value) => {
      store.current.set(key, value);
    },
    getRuntime: (key) => runtimeStore.current.get(key),
    setRuntime: (key, value) => {
      runtimeStore.current.set(key, value);
    },
    clearRuntime: (key) => {
      runtimeStore.current.delete(key);
    },
    invalidate: (key) => {
      if (key === undefined) {
        store.current.clear();
        runtimeStore.current.clear();
      } else {
        store.current.delete(key);
        runtimeStore.current.delete(key);
      }
    },
  });
  return <QcScanCacheContext.Provider value={cacheRef.current}>{children}</QcScanCacheContext.Provider>;
}

/** The QC scan cache, or null when rendered outside the provider (defensive — treat as no cache). */
export function useQcScanCache(): QcScanCache | null {
  return useContext(QcScanCacheContext);
}
