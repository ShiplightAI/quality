import { existsSync, statSync } from "node:fs";
import path, { resolve } from "node:path";
import { applySavedQcView } from "../views";
import { projectEvidenceScores } from "../workspace/project-evidence-scores";
import { buildObservationContextQualityRollups } from "../observations/rollup";
import { buildRuntimeImprovementRecommendations } from "../observations/recommend";
import { buildTargetEvaluation } from "../observations/evaluate";
import {
  executeObservationSet,
  findObservationSet,
  type ObservationSetExecutionResult,
  type ObservationSetExecutionSelection
} from "../observation-sets";
import { findSavedQcView } from "../views/filter";
import type { HostObservationTransportRegistry } from "../observation-sources";
import { resolveObservations } from "../observations/resolve";
import { scanProject } from "../discovery/scan-project";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type { ScanResult } from "../discovery/types";
import type { ObservationResolutionAuditRow, ObservationResolutionResult } from "../observations/types";
import type { RuntimeImprovementRecommendation } from "../observations/recommend";
import type { TargetEvaluationSnapshot } from "../observations/types";

export interface RecommendationFixPromptRecord {
  readonly expectation_id: string;
  readonly prompt: string;
  readonly quality_map: string;
}

export interface RecommendationScope {
  readonly kind: "whole-project" | "view";
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface RecommendationProfileRecord {
  readonly profile_id: string;
  readonly profile_name: string;
  readonly status: string;
  readonly transport: string;
  readonly run_id?: number;
  readonly run_url?: string;
  readonly commit?: string;
  readonly branch?: string;
  readonly observed_at?: string;
}

export interface RecommendationResolutionAuditExample {
  readonly observation_id: string;
  readonly match_status: "unmatched" | "ambiguous";
  readonly status: string;
  readonly test_file?: string;
  readonly test_case?: string;
  readonly test_class?: string;
  readonly source_id?: string;
  readonly source_label?: string;
  readonly run_url?: string;
}

export interface RecommendationResolutionAuditSummary {
  readonly matched_observation_count: number;
  readonly unmatched_observation_count: number;
  readonly ambiguous_observation_count: number;
  readonly unmatched_examples: readonly RecommendationResolutionAuditExample[];
  readonly ambiguous_examples: readonly RecommendationResolutionAuditExample[];
}

export interface RankedRecommendationRecord {
  readonly rank: number;
  readonly recommendation_id: string;
  readonly target_id: string;
  readonly target_name: string;
  readonly expectation_id: string;
  readonly expectation_local_id: string;
  readonly expectation_title: string;
  readonly quality_map_path: string;
  readonly observed_state: string;
  readonly score_lift: number;
  readonly current_score: number;
  readonly projected_score: number;
  readonly priority_weight: number;
  readonly priority?: string;
  readonly structural_status: string;
  readonly evidence_confidence: string;
  readonly structure_confidence: string;
  readonly structure_provenance: string;
  readonly reason: string;
  readonly next_action: string;
  readonly proof_source_paths: readonly string[];
  readonly verification_commands: readonly string[];
  readonly prompt_source: "canonical" | "fallback";
  readonly prompt: string;
}

// Static, observation-independent aggregate scores derived from the scanned
// project structure and its quality maps alone. Distinct from
// runtime_review.quality_score (observation-backed): these hold even when no
// observation set runs and no GITHUB_TOKEN is present. quality_score_static is
// the structural analogue of the runtime quality score and is named apart from
// it so the two are never conflated.
export interface StructuralScoresRecord {
  readonly coverage_score?: number;
  readonly evidence_confidence_score?: number;
  readonly structure_confidence_score?: number;
  readonly quality_score_static?: number;
  readonly evidence_confidence_label?: string;
  readonly structure_confidence_label?: string;
  readonly total_check_count?: number;
  readonly basis?: string;
}

// Whether the observation-backed Quality score could be produced, and why not
// when it could not. The three static scores in structural_scores never depend
// on this: they are derived from the graph alone.
export interface QualityScoreAvailabilityRecord {
  // "not_requested": no observation set was selected, so no runtime data was
  // asked for. "unavailable": an observation set ran but yielded no score.
  readonly status: "available" | "not_requested" | "unavailable";
  readonly reason?: string;
}

export interface RecommendationExportFile {
  // Bumped to "3" when risk was removed: risk_weight -> priority_weight (priority
  // is now the sole importance signal) and evidence confidence became
  // type-derived. The version gate makes pre-rename generated files fail
  // validation and prompt regeneration instead of silently yielding stale fields.
  // structural_scores was added additively (optional) under "4". Version "5"
  // replaces runtime_review.profiles[].source_kind with transport so readers
  // reject stale profile records instead of silently accepting the old field.
  // Version "6" makes the observation set optional: a run without one omits
  // observation_set_id, observation_set_name, and runtime_review entirely and
  // reports only the static scores. quality_score_availability was added as a
  // required field, so version-5 files (which lack it) must be regenerated.
  readonly schema_version: "6";
  readonly generated_at: string;
  readonly project_path: string;
  readonly project_root: string;
  // Absent when the run selected no observation set.
  readonly observation_set_id?: string;
  readonly observation_set_name?: string;
  readonly scope: RecommendationScope;
  readonly structural_scores?: StructuralScoresRecord;
  readonly quality_score_availability: QualityScoreAvailabilityRecord;
  // Absent when the run selected no observation set: no runtime review happened.
  readonly runtime_review?: {
    readonly execution_status: string;
    readonly resolution_status: string;
    readonly observation_count: number;
    readonly resolved_commit?: string;
    readonly evaluated_target_count: number;
    readonly evaluated_expectation_count: number;
    readonly quality_score?: number;
    readonly basis?: string;
    readonly profiles: readonly RecommendationProfileRecord[];
    readonly execution_diagnostics: readonly ScanDiagnostic[];
    readonly resolution_diagnostics: readonly ScanDiagnostic[];
    readonly resolution_audit: RecommendationResolutionAuditSummary;
  };
  readonly recommendations: readonly RankedRecommendationRecord[];
}

export interface BuildRecommendationExportInput {
  readonly projectPath: string;
  // Optional: without it the export carries the static scores only, and the
  // observation-backed Quality score is reported as not requested.
  readonly observationSetId?: string;
  readonly viewId?: string;
  readonly output?: string;
  readonly limit?: number;
  readonly selection?: ObservationSetExecutionSelection;
  readonly env?: NodeJS.ProcessEnv;
  /** Host transports for `transport: host` profiles, keyed by `host.provider`. */
  readonly hostTransports?: HostObservationTransportRegistry;
  readonly fixPromptRecords?: readonly RecommendationFixPromptRecord[];
  readonly generatedAt?: Date;
}

export interface RecommendationExportBuildResult {
  readonly file: RecommendationExportFile;
  readonly outputPath: string;
}

function hasUsableRuntimeProofStatus(input: {
  readonly executionStatus: string;
  readonly resolutionStatus: string;
  readonly observationCount: number;
}): boolean {
  return input.executionStatus !== "invalid" && input.resolutionStatus !== "invalid" && input.observationCount > 0;
}

// KNOWN, PRE-EXISTING: this is not injective. `my view` and `my-view` both
// reduce to `my-view`, so two saved views with those ids write the same export
// and one silently overwrites the other. Making the segment unique renames the
// file for every id that needs sanitizing, which breaks anything addressing an
// existing export by name — a trade that belongs in its own change, not here.
function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

// A run without an observation set writes under the reserved "static" prefix, so
// a static-only export never overwrites an observation set's export for the same
// scope.
const staticOnlyFileSegment = "static";

function defaultOutputPath(repoRoot: string, observationSetId: string | undefined, scopeId: string): string {
  const setSegment = observationSetId === undefined ? staticOnlyFileSegment : sanitizeFileSegment(observationSetId);
  return path.join(
    repoRoot,
    ".quality/generated/recommendations",
    `${setSegment}--${sanitizeFileSegment(scopeId)}.json`
  );
}

export function recommendationExportOutputPath(input: {
  readonly observationSetId?: string;
  readonly repoRoot: string;
  readonly requested?: string;
  readonly scopeId: string;
}): string {
  if (input.requested === undefined) {
    return defaultOutputPath(input.repoRoot, input.observationSetId, input.scopeId);
  }
  return path.isAbsolute(input.requested) ? input.requested : path.join(input.repoRoot, input.requested);
}

function selectedScope(result: ScanResult, viewId: string | undefined): RecommendationScope {
  const view = findSavedQcView(result, viewId);
  if (view === undefined) {
    return {
      kind: "whole-project",
      id: "whole-project",
      name: "Whole project"
    };
  }

  return {
    kind: "view",
    id: view.id,
    name: view.name,
    ...(view.description === undefined ? {} : { description: view.description })
  };
}

function buildEvaluationTargets(input: {
  readonly result: ScanResult;
  readonly resolution: ObservationResolutionResult;
  readonly execution: ObservationSetExecutionResult;
}): readonly TargetEvaluationSnapshot[] {
  const targetIds = input.result.qualityMaps.results.flatMap((entry) =>
    entry.graph === undefined ? [] : [entry.graph.target.normalizedId]
  );
  const uniqueTargetIds = [...new Set(targetIds)];

  return uniqueTargetIds.map((targetId) =>
    buildTargetEvaluation({
      result: input.result,
      targetId,
      observations: input.resolution,
      selection: {
        ...(input.execution.resolvedCommit === undefined ? {} : { commit: input.execution.resolvedCommit })
      }
    })
  );
}

function targetIdsInResult(result: ScanResult): ReadonlySet<string> {
  return new Set(
    result.qualityMaps.results
      .map((entry) => entry.graph?.target.normalizedId)
      .filter((value): value is string => value !== undefined)
  );
}

function filterResolutionForScope(input: {
  readonly result: ScanResult;
  readonly resolution: ObservationResolutionResult;
}): ObservationResolutionResult {
  const allowedTargetIds = targetIdsInResult(input.result);

  return {
    ...input.resolution,
    observations: input.resolution.observations.filter((observation) => allowedTargetIds.has(observation.subjectId)),
    auditRows: input.resolution.auditRows.filter(
      (row) => row.targetId === undefined || allowedTargetIds.has(row.targetId)
    )
  };
}

const maxResolutionAuditExamples = 20;

function resolutionAuditExample(row: ObservationResolutionAuditRow): RecommendationResolutionAuditExample {
  return {
    observation_id: row.observationId,
    match_status: row.matchStatus as "unmatched" | "ambiguous",
    status: row.status,
    ...(row.testFile === undefined ? {} : { test_file: row.testFile }),
    ...(row.testCase === undefined ? {} : { test_case: row.testCase }),
    ...(row.testClass === undefined ? {} : { test_class: row.testClass }),
    ...(row.sourceId === undefined ? {} : { source_id: row.sourceId }),
    ...(row.sourceLabel === undefined ? {} : { source_label: row.sourceLabel }),
    ...(row.runUrl === undefined ? {} : { run_url: row.runUrl })
  };
}

function resolutionAuditSummary(rows: readonly ObservationResolutionAuditRow[]): RecommendationResolutionAuditSummary {
  const unmatched = rows.filter((row) => row.matchStatus === "unmatched");
  const ambiguous = rows.filter((row) => row.matchStatus === "ambiguous");

  return {
    matched_observation_count: rows.filter((row) => row.matchStatus === "matched").length,
    unmatched_observation_count: unmatched.length,
    ambiguous_observation_count: ambiguous.length,
    unmatched_examples: unmatched.slice(0, maxResolutionAuditExamples).map(resolutionAuditExample),
    ambiguous_examples: ambiguous.slice(0, maxResolutionAuditExamples).map(resolutionAuditExample)
  };
}

function primaryRollup(
  rollups: readonly ReturnType<typeof buildObservationContextQualityRollups>[number][]
): ReturnType<typeof buildObservationContextQualityRollups>[number] | undefined {
  return rollups[0];
}

function liftLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function fallbackPromptForRecommendation(recommendation: RuntimeImprovementRecommendation): string {
  const lines = [
    `Improve the runtime quality score by fixing ${recommendation.targetName} -> ${recommendation.expectationTitle}.`,
    `Current runtime state: ${recommendation.observedState}. Estimated score lift: +${liftLabel(recommendation.potentialLift)} points, from ${recommendation.currentScore}/100 to ${recommendation.projectedScore}/100.`,
    `Why this matters: ${recommendation.reason}`,
    `Recommended action: ${recommendation.nextAction}`
  ];

  if (recommendation.proofSourcePaths.length > 0) {
    lines.push(`Proof sources: ${recommendation.proofSourcePaths.join(", ")}`);
  }

  if (recommendation.verificationCommands.length > 0) {
    lines.push(`Verification commands: ${recommendation.verificationCommands.join(" | ")}`);
  }

  lines.push(
    "Make the smallest correct fix, rerun the linked proof, and update quality evidence only if the results changed."
  );
  return lines.join("\n");
}

function promptForRecommendation(
  recommendation: RuntimeImprovementRecommendation,
  fixPromptLookup: ReadonlyMap<string, string>
): {
  readonly prompt: string;
  readonly promptSource: "canonical" | "fallback";
} {
  const key = `${recommendation.qualityMapPath}::${recommendation.expectationLocalId}`;
  const canonical = fixPromptLookup.get(key);
  const context = [
    `Priority recommendation: raise the current runtime quality score by about ${liftLabel(recommendation.potentialLift)} points, from ${recommendation.currentScore}/100 to ${recommendation.projectedScore}/100.`,
    `Target: ${recommendation.targetName}`,
    `Quality check: ${recommendation.expectationTitle}`,
    `Current runtime state: ${recommendation.observedState}`,
    `Why this matters: ${recommendation.reason}`
  ].join("\n");

  if (canonical === undefined) {
    return {
      prompt: fallbackPromptForRecommendation(recommendation),
      promptSource: "fallback"
    };
  }

  return {
    prompt: `${context}\n\n${canonical}`,
    promptSource: "canonical"
  };
}

function recommendationRecord(
  recommendation: RuntimeImprovementRecommendation,
  rank: number,
  fixPromptLookup: ReadonlyMap<string, string>
): RankedRecommendationRecord {
  const prompt = promptForRecommendation(recommendation, fixPromptLookup);

  return {
    rank,
    recommendation_id: recommendation.id,
    target_id: recommendation.targetId,
    target_name: recommendation.targetName,
    expectation_id: recommendation.expectationId,
    expectation_local_id: recommendation.expectationLocalId,
    expectation_title: recommendation.expectationTitle,
    quality_map_path: recommendation.qualityMapPath,
    observed_state: recommendation.observedState,
    score_lift: recommendation.potentialLift,
    current_score: recommendation.currentScore,
    projected_score: recommendation.projectedScore,
    priority_weight: recommendation.priorityWeight,
    ...(recommendation.priority === undefined ? {} : { priority: recommendation.priority }),
    structural_status: recommendation.structuralStatus,
    evidence_confidence: recommendation.evidenceConfidence,
    structure_confidence: recommendation.structureConfidence,
    structure_provenance: recommendation.structureProvenance,
    reason: recommendation.reason,
    next_action: recommendation.nextAction,
    proof_source_paths: recommendation.proofSourcePaths,
    verification_commands: recommendation.verificationCommands,
    prompt_source: prompt.promptSource,
    prompt: prompt.prompt
  };
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Derive the static, observation-independent scores from the (view-scoped) scan.
// Reuses the same aggregation the web dashboard renders (projectEvidenceScores),
// so the CLI export and the dashboard can never drift. This lean score core
// deliberately avoids buildProjectIndex, so the CLI export does not bundle the
// dashboard's analytics/gap-triage/owner-view machinery. Returns undefined only when
// there is no structure to score (no quality maps); otherwise the block is emitted
// regardless of runtime acquisition, so a token-less run still reports coverage
// and both confidence scores.
function structuralScoresFor(result: ScanResult): StructuralScoresRecord | undefined {
  const scores = projectEvidenceScores(result);
  if (scores === undefined) {
    return undefined;
  }
  const summary = scores.summary;
  const coverage = optionalNumber(summary.coverageScore);
  const evidenceConfidence = optionalNumber(summary.evidenceConfidenceScore);
  const structureConfidence = optionalNumber(summary.structureConfidenceScore);
  const qualityStatic = optionalNumber(summary.qualityScore);
  const record: StructuralScoresRecord = {
    ...(coverage === undefined ? {} : { coverage_score: coverage }),
    ...(evidenceConfidence === undefined ? {} : { evidence_confidence_score: evidenceConfidence }),
    ...(structureConfidence === undefined ? {} : { structure_confidence_score: structureConfidence }),
    ...(qualityStatic === undefined ? {} : { quality_score_static: qualityStatic }),
    ...(summary.evidenceConfidence === undefined ? {} : { evidence_confidence_label: summary.evidenceConfidence }),
    ...(summary.structureConfidence === undefined ? {} : { structure_confidence_label: summary.structureConfidence }),
    ...(summary.totalCheckCount === undefined ? {} : { total_check_count: summary.totalCheckCount }),
    ...(summary.basis === undefined ? {} : { basis: summary.basis })
  };
  return record;
}

function firstErrorMessage(diagnostics: readonly ScanDiagnostic[]): string | undefined {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error")?.message;
}

// Explains the observation-backed Quality score: present, never asked for, or
// asked for but not produced. Only the Quality score is affected — coverage,
// evidence confidence, and structure confidence come from the graph either way.
function qualityScoreAvailabilityFor(input: {
  readonly observationSetSelected: boolean;
  readonly qualityScore?: number;
  readonly execution?: ObservationSetExecutionResult;
  readonly resolution?: ObservationResolutionResult;
  readonly scopedObservationCount: number;
}): QualityScoreAvailabilityRecord {
  if (!input.observationSetSelected) {
    return {
      status: "not_requested",
      reason:
        "No observation set was selected, so no runtime results were loaded. The Quality score needs runtime observations; coverage, evidence confidence, and structure confidence do not."
    };
  }

  if (input.qualityScore !== undefined) {
    return { status: "available" };
  }

  const execution = input.execution;
  const resolution = input.resolution;

  if (execution !== undefined && execution.status === "invalid") {
    const detail = firstErrorMessage(execution.diagnostics);
    return {
      status: "unavailable",
      reason:
        detail === undefined
          ? "Runtime results could not be acquired from the observation set."
          : `Runtime results could not be acquired from the observation set: ${detail}`
    };
  }

  if (resolution !== undefined && resolution.status === "invalid") {
    const detail = firstErrorMessage(resolution.diagnostics);
    return {
      status: "unavailable",
      reason:
        detail === undefined
          ? "Loaded observations could not be resolved against the mapped proof."
          : `Loaded observations could not be resolved against the mapped proof: ${detail}`
    };
  }

  if (input.scopedObservationCount === 0) {
    return {
      status: "unavailable",
      reason: "The observation set loaded no observations that resolve to mapped proof in this scope."
    };
  }

  return {
    status: "unavailable",
    reason: "No runtime check in this scope could be evaluated, so no Quality score was produced."
  };
}

export async function buildRecommendationExport(
  input: BuildRecommendationExportInput
): Promise<RecommendationExportBuildResult> {
  const repoRoot = resolve(input.projectPath);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    throw new Error(`Repo path is not a directory: ${repoRoot}`);
  }
  if (input.observationSetId !== undefined && input.observationSetId.length === 0) {
    throw new Error("The observation set id must not be empty.");
  }
  if (input.observationSetId?.toLowerCase() === staticOnlyFileSegment) {
    throw new Error(`The observation set id ${staticOnlyFileSegment} is reserved for static-only assessments.`);
  }

  const scan = await scanProject({
    projectPath: repoRoot,
    mode: "scan"
  });
  if (scan.status === "failed") {
    throw new Error(scan.diagnostics[0]?.message ?? "The project path could not be scanned.");
  }

  if (input.viewId !== undefined && findSavedQcView(scan, input.viewId) === undefined) {
    throw new Error(`Saved QC view not found: ${input.viewId}`);
  }

  // Without an observation set the whole runtime half is skipped: no acquisition,
  // no resolution, no runtime_review block. The static scores below are unaffected.
  const observationSet =
    input.observationSetId === undefined
      ? undefined
      : findObservationSet(scan.observationSets, input.observationSetId);
  if (input.observationSetId !== undefined && observationSet === undefined) {
    throw new Error(`Observation set not found: ${input.observationSetId}`);
  }

  const execution =
    observationSet === undefined
      ? undefined
      : await executeObservationSet({
          observationSet,
          observationSourceProfiles: scan.observationSourceProfiles.primary?.document?.profiles ?? [],
          projectRoot: scan.target.resolvedPath,
          env: input.env,
          selection: input.selection,
          hostTransports: input.hostTransports
        });
  const resolution = execution === undefined ? undefined : resolveObservations(scan, execution);
  const effectiveResult = applySavedQcView(scan, input.viewId) ?? scan;
  const scopedResolution =
    resolution === undefined
      ? undefined
      : filterResolutionForScope({
          result: effectiveResult,
          resolution
        });
  const hasUsableProof =
    execution !== undefined &&
    resolution !== undefined &&
    hasUsableRuntimeProofStatus({
      executionStatus: execution.status,
      resolutionStatus: resolution.status,
      observationCount: execution.observations.length
    });
  const evaluations =
    hasUsableProof && execution !== undefined && scopedResolution !== undefined
      ? buildEvaluationTargets({
          result: effectiveResult,
          resolution: scopedResolution,
          execution
        })
      : [];
  const rollups = hasUsableProof
    ? buildObservationContextQualityRollups({
        result: effectiveResult,
        groups: [{ targets: evaluations }]
      })
    : [];
  const rollup = primaryRollup(rollups);
  const structuralScores = structuralScoresFor(effectiveResult);
  const qualityScoreAvailability = qualityScoreAvailabilityFor({
    observationSetSelected: observationSet !== undefined,
    ...(rollup?.qualityScore === undefined ? {} : { qualityScore: rollup.qualityScore }),
    ...(execution === undefined ? {} : { execution }),
    ...(resolution === undefined ? {} : { resolution }),
    scopedObservationCount: scopedResolution?.observations.length ?? 0
  });
  const fixPromptLookup = new Map(
    (input.fixPromptRecords ?? []).map(
      (record) => [`${record.quality_map}::${record.expectation_id}`, record.prompt] as const
    )
  );
  const rankedRecommendations = buildRuntimeImprovementRecommendations({
    result: effectiveResult,
    targets: evaluations,
    limit: input.limit
  }).map((recommendation, index) => recommendationRecord(recommendation, index + 1, fixPromptLookup));
  const scope = selectedScope(scan, input.viewId);
  const outputPath = recommendationExportOutputPath({
    repoRoot,
    requested: input.output,
    ...(observationSet === undefined ? {} : { observationSetId: observationSet.id }),
    scopeId: scope.id
  });
  const runtimeReview =
    execution === undefined || resolution === undefined || scopedResolution === undefined
      ? undefined
      : {
          execution_status: execution.status,
          resolution_status: resolution.status,
          observation_count: scopedResolution.observations.length,
          ...(execution.resolvedCommit === undefined ? {} : { resolved_commit: execution.resolvedCommit }),
          evaluated_target_count: rollup?.evaluatedTargetCount ?? 0,
          evaluated_expectation_count: rollup?.evaluatedExpectationCount ?? 0,
          ...(rollup?.qualityScore === undefined ? {} : { quality_score: rollup.qualityScore }),
          ...(rollup?.basis === undefined ? {} : { basis: rollup.basis }),
          profiles: execution.profiles.map((profile) => ({
            profile_id: profile.profileId,
            profile_name: profile.profileName,
            status: profile.execution.status,
            transport: profile.execution.transport,
            ...(profile.execution.selectedRun?.runId === undefined
              ? {}
              : { run_id: profile.execution.selectedRun.runId }),
            ...(profile.execution.selectedRun?.runUrl === undefined
              ? {}
              : { run_url: profile.execution.selectedRun.runUrl }),
            ...(profile.execution.selectedRun?.commit === undefined
              ? {}
              : { commit: profile.execution.selectedRun.commit }),
            ...(profile.execution.selectedRun?.branch === undefined
              ? {}
              : { branch: profile.execution.selectedRun.branch }),
            ...(profile.execution.selectedRun?.observedAt === undefined
              ? {}
              : { observed_at: profile.execution.selectedRun.observedAt })
          })),
          execution_diagnostics: execution.diagnostics,
          resolution_diagnostics: resolution.diagnostics,
          resolution_audit: resolutionAuditSummary(scopedResolution.auditRows)
        };

  return {
    outputPath,
    file: {
      schema_version: "6",
      generated_at: (input.generatedAt ?? new Date()).toISOString(),
      project_path: scan.target.inputPath,
      project_root: scan.target.resolvedPath,
      ...(observationSet === undefined
        ? {}
        : { observation_set_id: observationSet.id, observation_set_name: observationSet.name }),
      scope,
      ...(structuralScores === undefined ? {} : { structural_scores: structuralScores }),
      quality_score_availability: qualityScoreAvailability,
      ...(runtimeReview === undefined ? {} : { runtime_review: runtimeReview }),
      recommendations: rankedRecommendations
    }
  };
}
