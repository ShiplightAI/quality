import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { QcUiHostProvider, type QcUiHost } from "./host";

// Test-only support. Every Quality UI component reads the host seam (route/API prefixes and the
// project-persistence action), so rendering one bare throws by design — that guard is what stops a
// host from mounting the UI without wiring its prefixes. Tests therefore render through this
// wrapper rather than @testing-library's `render` directly.
//
// Not exported from the package entrypoint: it pulls in @testing-library, which is a devDependency.

export const testHost: QcUiHost = {
  routeBase: "/quality-explorer",
  apiBase: "/api/quality-explorer",
  setProject: () => Promise.resolve({ ok: true }),
};

export function withHost(children: ReactNode, host: QcUiHost = testHost): ReactElement {
  return <QcUiHostProvider host={host}>{children}</QcUiHostProvider>;
}

/** Drop-in for @testing-library's `render`, wrapped in the host provider. */
export function render(
  ui: ReactElement,
  options?: RenderOptions & { readonly host?: QcUiHost },
): RenderResult {
  const { host = testHost, ...rest } = options ?? {};
  return rtlRender(withHost(ui, host), rest);
}
