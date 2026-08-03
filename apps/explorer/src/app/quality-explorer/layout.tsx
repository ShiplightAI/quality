import type { ReactNode } from "react";
import { QcScanCacheProvider } from "@/components/quality-explorer/scan-cache";
import "./quality-explorer.css";

// QC nests inside shipyard's (app) shell (outer nav + auth). This layout brings QC's stylesheet and
// the per-project scan cache (reused across sub-page navigation, since this layout persists). The
// project switcher lives in the left nav (NavProjectSwitcher, fed by the app shell); Refresh lives
// on the page (ProjectScanner's view-selector row). The `qc-app` wrapper scopes QC's few
// bare-element rules.
//
// Access: QC is reachable by direct URL to any authenticated shipyard user (the (app) shell enforces
// sign-in). It is only *hidden* from the nav for orgs without `quality_center_enabled` (nav-items.tsx
// / shell.tsx). API routes enforce their own session check via requireQcSession.
export default function QualityCenterLayout({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <div className="qc-app">
      <QcScanCacheProvider>{children}</QcScanCacheProvider>
    </div>
  );
}
