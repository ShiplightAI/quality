import type { ReactNode } from "react";
import { QcScanCacheProvider, QcUiHostProvider, type QcUiHost } from "@shiplightai/quality-ui";
import { setQcProjectAction } from "./_actions/project";
import "@shiplightai/quality-ui/styles.css";

// Composition root for Quality Explorer. The presentation lives in `@shiplightai/quality-ui`, which
// is host-agnostic: it knows no filesystem, GitHub, auth, or organizations. This layout supplies the
// two things it cannot know — where its routes live, and how the host persists a project selection —
// plus the per-project scan cache (reused across sub-page navigation, since this layout persists).
// The `qc-app` wrapper scopes the package stylesheet's few bare-element rules.
//
// Access: Quality Explorer is a local, single-user tool with no sign-in (`requireQcSession` is a
// no-op here). Shiplight Quality Center mounts these same components behind its own auth.
const host: QcUiHost = {
  routeBase: "/quality-explorer",
  apiBase: "/api/quality-explorer",
  setProject: setQcProjectAction,
};

export default function QualityExplorerLayout({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <div className="qc-app">
      <QcUiHostProvider host={host}>
        <QcScanCacheProvider>{children}</QcScanCacheProvider>
      </QcUiHostProvider>
    </div>
  );
}
