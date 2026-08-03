// Import from the leaf subpath, NOT the "@shiplightai/quality-map" barrel: the barrel re-exports
// parse.ts (node:fs), which Turbopack would then drag into the browser bundle of any client component
// that reaches /gap-triage (e.g. FeaturePage) — a build break. gap-categories.ts is a pure const.
import { GAP_CATEGORIES, type GapCategory } from "@shiplightai/quality-map/gap-categories";
import type { ScanResult } from "../discovery/types";
import type {
  EvidenceDiagnostic,
  EvidenceSourceAttribution
} from "../evidence-view/types";
import type {
  IndexSourceClassification,
  IndexSourceReference,
  TargetDestinationKind
} from "../project-index/types";

export type GapTriageState = "ready" | "missingTarget" | "directOpen" | "empty";

// The canonical gap categories now live in @shiplightai/quality-map (the dep-light contract
// package that also owns the field vocabulary + schema emitter), so the runtime list, the type,
// and the emitted JSON Schema share one home. Re-exported here unchanged so the many
// `.../gap-triage` importers and `GapCategory` sites stay put. (Score-driving categories:
// missing / manual-only / weak — see assessment.ts scoreStatus + classify-gaps.)
export { GAP_CATEGORIES, type GapCategory };

export interface GapFilters {
  readonly category?: GapCategory | "all";
  readonly priority?: string | "all";
  readonly evidenceState?: string | "all";
  readonly sourceClassification?: IndexSourceClassification | "all";
  readonly residualRisk?: "all" | "with-risk" | "without-risk";
}

export interface GapEvidenceSummary {
  readonly evidenceId: string;
  readonly label: string;
  readonly type: string;
  readonly depth: string;
  readonly path?: string;
  readonly url?: string;
  readonly command?: string;
  readonly pathOrUrl: string;
}

export interface NextUsefulProofContext {
  readonly text: string;
  readonly availability: "source-provided" | "unavailable";
  readonly sourceAttribution?: EvidenceSourceAttribution;
}

export interface GapRecord {
  readonly gapId: string;
  readonly category: GapCategory;
  readonly categoryLabel: string;
  readonly targetId: string;
  readonly expectationId: string;
  readonly expectationTitle: string;
  readonly priority: string;
  readonly expectationCategory: string;
  readonly evidenceState: string;
  readonly evidenceDepth: string;
  readonly evidence: readonly GapEvidenceSummary[];
  readonly residualRisk: string;
  readonly nextProof: NextUsefulProofContext;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
  readonly sourceAttribution?: EvidenceSourceAttribution;
  readonly diagnostics: readonly EvidenceDiagnostic[];
  readonly relatedCategoryIds: readonly GapCategory[];
  /**
   * A human has accepted this gap as tolerated risk (the check's `accepted_gaps`
   * lists this category). Accepted gaps are still returned so they can be shown and
   * un-accepted, but are excluded from open-gap counts, groups, and score metrics.
   */
  readonly accepted: boolean;
}

export interface GapCategoryGroup {
  readonly category: GapCategory;
  readonly label: string;
  readonly records: readonly GapRecord[];
}

export interface GapSummaryItem {
  readonly category: GapCategory;
  readonly label: string;
  readonly count: number;
}

export interface GapTargetSummary {
  readonly targetId: string;
  readonly displayName: string;
  readonly scope: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
}

export interface GapTriageView {
  readonly state: GapTriageState;
  readonly summary: GapTargetSummary;
  readonly filters: GapFilters;
  readonly records: readonly GapRecord[];
  readonly filteredRecords: readonly GapRecord[];
  readonly groups: readonly GapCategoryGroup[];
  readonly summaries: readonly GapSummaryItem[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
  readonly selectedGap?: GapRecord;
  readonly missingSelection?: {
    readonly targetId?: string;
    readonly expectationId?: string;
    readonly evidenceId?: string;
    readonly gapId?: string;
    readonly recoveryAction: string;
  };
}

export interface BuildGapTriageInput {
  readonly result?: ScanResult;
  readonly targetId: string;
  readonly filters?: GapFilters;
  readonly selectedGapId?: string;
  readonly selectedExpectationId?: string;
  readonly selectedEvidenceId?: string;
}

export interface GapNavigationContext {
  readonly destinationKind: TargetDestinationKind;
  readonly targetId: string;
  readonly expectationId?: string;
  readonly evidenceId?: string;
  readonly gapId?: string;
  readonly category?: GapCategory;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
}
