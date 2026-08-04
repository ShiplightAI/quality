"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

// The host seam. `@shiplightai/quality-ui` renders the Quality presentation and nothing else: it
// knows no filesystem, no GitHub, no auth, no organizations. Everything that differs between the
// two hosts — Quality Explorer (local, single-user) and Shiplight Quality Center (multi-tenant) —
// arrives through this context.
//
// It exists because both hosts previously hardcoded their own route and API prefixes into every
// component ("/api/quality-explorer/scan" vs "/api/quality-center/scan"). That is precisely how the
// two copies drifted: a route deleted in one host left a live `fetch` in the other that 404s
// silently, because `fetch` does not reject on 404. Injecting the prefixes makes a mismatch a type
// error at the composition root instead of a runtime 404 buried in a component.

/** What the host persists when the user picks a different project. */
export type QcProjectSelection =
  | { readonly kind: "hosted"; readonly targetId: string }
  | { readonly kind: "local"; readonly path: string };

/**
 * The project currently being rendered, resolved server-side by the host (from a cookie + org in
 * Quality Center, from the fixed server root in Quality Explorer) and passed down as a prop.
 * `projectKey` is the cache key the scan cache is keyed on.
 */
export type ScannerProject =
  | { readonly kind: "hosted"; readonly projectKey: string }
  | { readonly kind: "local"; readonly path: string; readonly projectKey: string }
  | { readonly kind: "none" };

export interface QcUiHost {
  /** Page route prefix, no trailing slash — e.g. `/quality-center` or `/quality-explorer`. */
  readonly routeBase: string;
  /** API route prefix, no trailing slash — e.g. `/api/quality-center`. */
  readonly apiBase: string;
  /**
   * Persist the newly selected project. A Server Action in both hosts, so it is passed across the
   * server/client boundary as a prop. Quality Explorer returns an error (its root is fixed at
   * startup); Quality Center writes the `qc_project` cookie after an auth check.
   */
  readonly setProject: (
    project: QcProjectSelection,
  ) => Promise<{ readonly ok: true } | { readonly error: string }>;
}

const QcUiHostContext = createContext<QcUiHost | null>(null);

export function QcUiHostProvider({
  host,
  children,
}: {
  readonly host: QcUiHost;
  readonly children: ReactNode;
}): React.ReactElement {
  // Memoize on the primitive fields so a host object rebuilt on every server render doesn't
  // invalidate every consumer. `setProject` is a stable Server Action reference in both hosts.
  const value = useMemo(
    () => host,
    [host.routeBase, host.apiBase, host.setProject],
  );
  return <QcUiHostContext.Provider value={value}>{children}</QcUiHostContext.Provider>;
}

/** The host contract. Throws when a Quality UI component is rendered outside the provider. */
export function useQcHost(): QcUiHost {
  const host = useContext(QcUiHostContext);
  if (host === null) {
    throw new Error(
      "Quality UI components must be rendered inside <QcUiHostProvider>. Mount it in the route layout.",
    );
  }
  return host;
}

/** Build a page URL under the host's route base: `qcRoute("/feature")` → `/quality-center/feature`. */
export function useQcRoute(): (path?: string) => string {
  const { routeBase } = useQcHost();
  return (path = "") => `${routeBase}${path}`;
}

/** Build an API URL under the host's API base: `qcApi("/scan")` → `/api/quality-center/scan`. */
export function useQcApi(): (path: string) => string {
  const { apiBase } = useQcHost();
  return (path) => `${apiBase}${path}`;
}
