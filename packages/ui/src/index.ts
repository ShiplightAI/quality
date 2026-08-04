// Public surface of `@shiplightai/quality-ui`.
//
// Only the components a host actually mounts as a page body are exported, plus the providers that
// must wrap them. Leaf components (Breadcrumb, GateLink, HelpTooltip, …) stay internal so the two
// hosts cannot drift by reaching past the composition root.
//
// Every host must wrap these in <QcUiHostProvider> (route/API prefixes + the project-persistence
// action) and <QcScanCacheProvider> (per-project scan cache, reused across sub-page navigation).

export { ProjectScanner } from "./components/ProjectScanner";
export { FeaturePage } from "./components/FeaturePage";
export { Settings } from "./components/Settings";
export { ViewsManager } from "./components/ViewsManager";
export { OwnerDashboard } from "./components/OwnerDashboard";
export { QcScanCacheProvider, useQcScanCache } from "./components/scan-cache";

export {
  QcUiHostProvider,
  useQcHost,
  useQcApi,
  useQcRoute,
  type QcUiHost,
  type QcProjectSelection,
  type ScannerProject,
} from "./host";
