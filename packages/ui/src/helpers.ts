// Pure presentation helpers — no React, no Next, no "use client".
//
// A separate entry point on purpose. The main entry bundles the component graph, which imports
// `next/link` and `next/navigation`; those only resolve inside a Next bundler, so importing a
// helper from the barrel would drag Next into any plain-Node context (a test runner, a script) and
// fail to resolve. These functions derive what the UI *shows* from a scan result, so both hosts
// contract-test them outside a browser — this entry is what they import.
//
// Keep this module free of React and Next imports. `import type` is fine (erased at build).

export { buildObservationProfilePresentation } from "./components/observation-profile-presentation";
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
export type { ObservationRuntimeExecutionView } from "./components/ObservationSourcePanel";
