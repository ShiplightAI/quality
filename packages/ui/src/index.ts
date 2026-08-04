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

// Presentation helpers a host may legitimately assert on. These derive what the UI shows from a
// scan result; both hosts contract-test them, so they are public surface rather than internals.
export { buildObservationProfilePresentation } from "./components/observation-profile-presentation";
export type { ObservationRuntimeExecutionView } from "./components/ObservationSourcePanel";
export { filterRuntimeExecutionForResult } from "./lib/filter-runtime-execution";
export { gapExpectationLocalId, verificationChecks } from "./lib/gap-detail";
export {
  hasUsableRuntimeProofStatus,
  hasLoadedRuntimeProof,
  hasLoadedProfileRuntimeProof,
  type RuntimeProofStatusInput,
  type RuntimeExecutionViewLike,
  type RuntimeProfileExecutionLike,
} from "./lib/runtime-proof";
