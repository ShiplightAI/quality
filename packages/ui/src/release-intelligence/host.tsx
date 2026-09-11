"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface ReleaseUiHost {
  /** Page route prefix without a trailing slash. */
  readonly routeBase: string;
  /** API route prefix without a trailing slash. */
  readonly apiBase: string;
}

const ReleaseUiHostContext = createContext<ReleaseUiHost | null>(null);

export function ReleaseUiHostProvider({
  host,
  children,
}: {
  readonly host: ReleaseUiHost;
  readonly children: ReactNode;
}): React.ReactElement {
  const value = useMemo(() => host, [host.routeBase, host.apiBase]);
  return <ReleaseUiHostContext.Provider value={value}>{children}</ReleaseUiHostContext.Provider>;
}

export function useReleaseUiHost(): ReleaseUiHost {
  const host = useContext(ReleaseUiHostContext);
  if (host === null) {
    throw new Error(
      "Release Intelligence components must be rendered inside <ReleaseUiHostProvider>.",
    );
  }
  return host;
}

export function useReleaseRoute(): (path?: string) => string {
  const { routeBase } = useReleaseUiHost();
  return (path = "") => `${routeBase}${path}`;
}

export function useReleaseApi(): (path: string) => string {
  const { apiBase } = useReleaseUiHost();
  return (path) => `${apiBase}${path}`;
}
