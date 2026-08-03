// Shared quality application operations. The data operations behind the
// QC UI, as pure functions over a project directory + an injected committer for
// writes. Shared by the local web tier (LocalFsDataAccess) and the on-VM `qc serve`
// so there is one implementation, deployed two ways. HTTP/route concerns live in the
// callers; these throw QcOperationError carrying the status to surface.

import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import {
  CommitError,
  applyFeatureEdits,
  applyQualityMapEdits,
  applySavedQcView,
  buildObservationContextQualityRollups,
  buildTargetEvaluation,
  commitFiles,
  createDiagnostic,
  evaluateObservationSourceProfilesEnv,
  executeObservationSet as runObservationSet,
  executeObservationSourceProfile,
  findObservationSet,
  findObservationSourceProfile,
  generateFixPrompts,
  parseSavedQcViews,
  resolveObservations,
  scanProject,
  serializeHumanSources,
  serializeObservationSets,
  serializeObservationSources,
  type HumanSource,
  type ObservationContextQualityRollup,
  type ObservationResolutionAuditRow,
  type ObservationResolutionResult,
  type ObservationSet,
  type ObservationSetExecutionResult,
  type ObservationSetExecutionSelection,
  type ObservationSourceExecutionResult,
  type ObservationSourceProfile,
  type ObservationSourceProfileEnvStatus,
  type ProjectMapFeatureEdit,
  type QualityMapEdits,
  type RecommendationExportFile,
  type SavedQcView,
  type ScanDiagnostic,
  type ScanResult,
  type TargetEvaluationSnapshot,
} from "../index";

// --- error + committer seam ---------------------------------------------------

export interface QcOperationErrorOptions {
  readonly code?: string;
  readonly diagnostics?: readonly ScanDiagnostic[];
}

export class QcOperationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly diagnostics?: readonly ScanDiagnostic[];

  constructor(status: number, message: string, options: QcOperationErrorOptions = {}) {
    super(message);
    this.name = "QcOperationError";
    this.status = status;
    this.code = options.code ?? "qc-operation-error";
    this.diagnostics = options.diagnostics;
  }
}

export function isQcOperationError(value: unknown): value is QcOperationError {
  return value instanceof QcOperationError;
}

/** The commit step of a write op, behind a seam (local git now; PR-first for hosted). */
export interface QcCommitter {
  commit(
    projectPath: string,
    paths: readonly string[],
    message: string,
  ): Promise<{ readonly sha: string }>;
}

/** Local git commit — the audit-is-the-commit model of local `qc`. */
export const gitCommitter: QcCommitter = {
  async commit(projectPath, paths, message) {
    const { sha } = await commitFiles(projectPath, [...paths], message);
    return { sha };
  },
};

// --- op input / result types --------------------------------------------------

export interface QcScanInput {
  readonly projectPath: string;
  readonly mode: "scan" | "refresh";
}
export interface QcScanResult {
  readonly result: ScanResult;
  readonly observationSourceEnv: readonly ObservationSourceProfileEnvStatus[];
}
export interface QcRecommendationsInput {
  readonly projectPath: string;
  readonly observationSetId: string;
  readonly viewId?: string;
}
export interface QcRecommendationsResult {
  readonly path: string;
  readonly file: RecommendationExportFile;
}
export interface QcMarkdownArtifact {
  readonly artifactPath: string;
  readonly content: string;
  readonly sizeBytes: number;
}
export interface QcFixPromptInput {
  readonly projectPath: string;
  readonly qualityMapPath: string;
  readonly expectationId: string;
}
export interface QcSaveFeaturesInput {
  readonly projectPath: string;
  readonly edits: readonly ProjectMapFeatureEdit[];
}
export interface QcSaveFeaturesResult {
  readonly path: string;
  readonly updated: readonly string[];
  readonly unknownIds: readonly string[];
  readonly committed: string;
}
export interface QcSaveSourcesInput {
  readonly projectPath: string;
  readonly sources: readonly HumanSource[];
}
export interface QcSaveSourcesResult {
  readonly path: string;
  readonly sources: readonly HumanSource[];
  readonly droppedCount: number;
  readonly committed: string;
}
export interface QcSaveQualityMapInput extends QualityMapEdits {
  readonly projectPath: string;
  readonly qualityMapPath: string;
}
export interface QcSaveQualityMapResult {
  readonly path: string;
  readonly updated: readonly string[];
  readonly unknownIds: readonly string[];
  readonly committed: string;
}
export interface QcObservationSetInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly profileIds: readonly string[];
}
export interface QcSaveObservationSetsInput {
  readonly projectPath: string;
  readonly observationSets: readonly QcObservationSetInput[];
}
export interface QcSaveObservationSetsResult {
  readonly path: string;
  readonly count: number;
  readonly committed: string;
}
export interface QcObservationSourceInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly transport: ObservationSourceProfile["transport"];
  readonly observationPath: string;
  readonly github?: {
    readonly repo: string;
    readonly workflow: string;
    readonly artifactNames: readonly string[];
    readonly branch?: string;
  };
  readonly localFolder?: { readonly path: string };
  // Preserved (not edited in the form) so a round-trip through the editor doesn't drop them.
  readonly sourceRefs?: readonly {
    readonly path?: string;
    readonly url?: string;
    readonly label?: string;
  }[];
  readonly requiredEnv?: readonly string[];
}
export interface QcSaveObservationSourcesInput {
  readonly projectPath: string;
  readonly observationSources: readonly QcObservationSourceInput[];
}
export interface QcSaveObservationSourcesResult {
  readonly path: string;
  readonly count: number;
  readonly committed: string;
}
export interface QcSavedViewInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly featureIds: readonly string[];
}
export interface QcSaveViewsInput {
  readonly projectPath: string;
  readonly views: readonly QcSavedViewInput[];
}
export interface QcSaveViewsResult {
  readonly path: string;
  readonly views: readonly SavedQcView[];
  readonly committed?: string;
}
export interface QcExecuteObservationSetInput {
  readonly projectPath: string;
  readonly setId: string;
  readonly viewId?: string;
  readonly selection?: ObservationSetExecutionSelection;
  /**
   * Env the github-actions fetch reads its token from (spec 045). In hosted mode `qc serve`
   * injects the org's GitHub App installation token as GITHUB_TOKEN here; a client can't set it.
   */
  readonly env?: NodeJS.ProcessEnv;
}
export interface QcExecuteObservationSourceInput {
  readonly projectPath: string;
  readonly profileId: string;
  readonly selection?: ObservationSetExecutionSelection;
  /** See QcExecuteObservationSetInput.env — the github-actions token env, injected by the box. */
  readonly env?: NodeJS.ProcessEnv;
}
interface QcExecutionResolution {
  readonly status: ObservationResolutionResult["status"];
  readonly auditRows: readonly ObservationResolutionAuditRow[];
  readonly diagnostics: readonly ScanDiagnostic[];
}
interface QcEvaluationGroup {
  readonly targets: readonly TargetEvaluationSnapshot[];
}
export interface QcExecuteObservationSetResult {
  readonly execution: ObservationSetExecutionResult;
  readonly resolution: QcExecutionResolution;
  readonly rollups: readonly ObservationContextQualityRollup[];
  readonly evaluations: readonly QcEvaluationGroup[];
}
export interface QcExecuteObservationSourceResult {
  readonly execution: ObservationSourceExecutionResult;
  readonly resolution: QcExecutionResolution;
  readonly rollups: readonly ObservationContextQualityRollup[];
  readonly evaluations: readonly QcEvaluationGroup[];
}

// --- helpers ------------------------------------------------------------------

const MAX_MARKDOWN_BYTES = 512 * 1024;

function diag(code: string, message: string): ScanDiagnostic {
  return createDiagnostic({ severity: "error", code: code as ScanDiagnostic["code"], message });
}

function commitFailure(error: CommitError, code: string): QcOperationError {
  return new QcOperationError(error.reason === "git_failed" ? 500 : 409, error.message, { code });
}

async function scanOrThrow(projectPath: string, code: string): Promise<ScanResult> {
  const result = await scanProject({ projectPath, mode: "scan" });
  if (result.status === "failed") {
    throw new QcOperationError(400, "The selected project could not be scanned.", {
      code,
      diagnostics: result.diagnostics,
    });
  }
  return result;
}

/** Runtime proof is usable when neither status is invalid and there are observations. */
function hasUsableProof(input: {
  executionStatus: string;
  resolutionStatus: string;
  observationCount: number;
}): boolean {
  return (
    input.executionStatus !== "invalid" &&
    input.resolutionStatus !== "invalid" &&
    input.observationCount > 0
  );
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function recommendationsOutputPath(
  projectPath: string,
  observationSetId: string,
  scopeId: string,
): string {
  return path.join(
    projectPath,
    ".quality/generated/recommendations",
    `${sanitizeFileSegment(observationSetId)}--${sanitizeFileSegment(scopeId)}.json`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecommendationProfileRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.profile_id === "string" &&
    typeof value.profile_name === "string" &&
    typeof value.status === "string" &&
    typeof value.transport === "string"
  );
}

function isRecommendationExportFile(value: unknown): value is RecommendationExportFile {
  if (!isRecord(value) || !isRecord(value.scope) || !isRecord(value.runtime_review)) return false;
  const profiles = value.runtime_review.profiles;
  return (
    value.schema_version === "5" &&
    typeof value.project_root === "string" &&
    typeof value.observation_set_id === "string" &&
    typeof value.scope.id === "string" &&
    Array.isArray(profiles) &&
    profiles.every(isRecommendationProfileRecord) &&
    Array.isArray(value.recommendations)
  );
}

function isMarkdownPath(inputPath: string): boolean {
  const extension = path.extname(inputPath).toLowerCase();
  return extension === ".md" || extension === ".markdown";
}

function isInsideProject(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveArtifactPath(projectPath: string, artifactPath: string): Promise<string> {
  const root = await realpath(projectPath);
  const candidate = path.isAbsolute(artifactPath)
    ? path.normalize(artifactPath)
    : path.resolve(root, artifactPath);
  const parent = await realpath(path.dirname(candidate));
  const resolved = path.join(parent, path.basename(candidate));
  if (!isInsideProject(root, resolved)) throw new Error("OUT_OF_PROJECT_ARTIFACT");
  const actual = await realpath(resolved);
  if (!isInsideProject(root, actual)) throw new Error("OUT_OF_PROJECT_ARTIFACT");
  return actual;
}

function firstDuplicate<T>(items: readonly T[], key: (item: T) => string): T | undefined {
  const seen = new Set<string>();
  return items.find((item) => {
    const k = key(item);
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
}

function validateSources(sources: readonly HumanSource[]): readonly ScanDiagnostic[] {
  const diagnostics: ScanDiagnostic[] = [];
  const seen = new Set<string>();
  sources.forEach((source) => {
    if (seen.has(source.key)) {
      diagnostics.push(
        diag("INVALID_PROJECT_SOURCE", `Source key ${source.key} is defined more than once.`),
      );
      return;
    }
    seen.add(source.key);
  });
  sources.forEach((source) => {
    if (source.status !== "superseded") return;
    if (
      source.supersededBy === undefined ||
      source.supersededBy === source.key ||
      !seen.has(source.supersededBy)
    ) {
      diagnostics.push(
        diag(
          "INVALID_PROJECT_SOURCE",
          `Source ${source.key} is superseded but superseded_by does not reference a known, different source.`,
        ),
      );
    }
  });
  return diagnostics;
}

function evaluationGroups(
  result: ScanResult,
  resolution: ObservationResolutionResult,
  commit: string | undefined,
): readonly QcEvaluationGroup[] {
  const targetIds = result.qualityMaps.results.flatMap((entry) =>
    entry.graph === undefined ? [] : [entry.graph.target.normalizedId],
  );
  return [
    {
      targets: targetIds.map((targetId) =>
        buildTargetEvaluation({
          result,
          targetId,
          observations: resolution,
          selection: { ...(commit === undefined ? {} : { commit }) },
        }),
      ),
    },
  ];
}

// --- read ops -----------------------------------------------------------------

export async function scanOp(input: QcScanInput): Promise<QcScanResult> {
  const result = await scanProject(input);
  const observationSourceEnv = evaluateObservationSourceProfilesEnv(
    result.observationSourceProfiles.primary?.document?.profiles ?? [],
  );
  return { result, observationSourceEnv };
}

export async function getRecommendationsOp(
  input: QcRecommendationsInput,
): Promise<QcRecommendationsResult> {
  const scopeId =
    input.viewId !== undefined && input.viewId.length > 0 ? input.viewId : "whole-project";
  const filePath = recommendationsOutputPath(input.projectPath, input.observationSetId, scopeId);
  if (!existsSync(filePath)) {
    throw new QcOperationError(
      404,
      "No generated recommendations file was found for the selected scope.",
      {
        code: "ranked-recommendations-not-found",
      },
    );
  }
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new QcOperationError(500, "The saved recommendations file could not be read.", {
      code: "ranked-recommendations-read-failed",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = undefined;
  }
  if (!isRecommendationExportFile(parsed)) {
    throw new QcOperationError(
      500,
      "The saved recommendations file is unreadable. Regenerate it for this scope with the quality-tools analyze command.",
      { code: "invalid-ranked-recommendations-output" },
    );
  }
  return { path: filePath, file: parsed };
}

export async function readMarkdownArtifactOp(
  projectPath: string,
  artifactPath: string,
): Promise<QcMarkdownArtifact> {
  if (!isMarkdownPath(artifactPath)) {
    throw new QcOperationError(415, "Only Markdown artifacts can be previewed.", {
      code: "unsupported-artifact-type",
    });
  }
  try {
    const resolved = await resolveArtifactPath(projectPath, artifactPath);
    await access(resolved, constants.R_OK);
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) {
      throw new QcOperationError(400, "The selected artifact is not a readable file.", {
        code: "artifact-not-file",
      });
    }
    if (fileStat.size > MAX_MARKDOWN_BYTES) {
      throw new QcOperationError(413, "The Markdown artifact is too large to preview.", {
        code: "artifact-too-large",
      });
    }
    return { artifactPath, content: await readFile(resolved, "utf8"), sizeBytes: fileStat.size };
  } catch (error) {
    if (error instanceof QcOperationError) throw error;
    if (error instanceof Error && error.message === "OUT_OF_PROJECT_ARTIFACT") {
      throw new QcOperationError(403, "The selected artifact is outside the scanned project.", {
        code: "out-of-project-artifact",
      });
    }
    throw new QcOperationError(404, "The selected Markdown artifact could not be read.", {
      code: "artifact-not-found",
    });
  }
}

export async function getFixPromptOp(
  input: QcFixPromptInput,
): Promise<{ readonly prompt: string }> {
  let records;
  try {
    records = generateFixPrompts({ repo: input.projectPath, format: "json" }).records;
  } catch {
    throw new QcOperationError(500, "The canonical fix-prompt generator could not be executed.", {
      code: "fix-prompt-generator-failed",
    });
  }
  const record = records.find(
    (candidate) =>
      candidate.quality_map === input.qualityMapPath &&
      candidate.expectation_id === input.expectationId,
  );
  if (record === undefined) {
    throw new QcOperationError(
      404,
      "No canonical fix prompt was found for the selected quality check.",
      {
        code: "fix-prompt-not-found",
      },
    );
  }
  return { prompt: record.prompt };
}

// --- write ops ----------------------------------------------------------------

export async function saveFeaturesOp(
  input: QcSaveFeaturesInput,
  committer: QcCommitter,
): Promise<QcSaveFeaturesResult> {
  const CODE = "INVALID_FEATURE_EDIT";
  const result = await scanOrThrow(input.projectPath, CODE);
  const primary = result.projectMaps.primary;
  if (primary?.map === undefined) {
    throw new QcOperationError(
      400,
      "A primary project map is required before features can be edited.",
      { code: CODE },
    );
  }
  const knownIds = new Set(primary.map.features.map((feature) => feature.id));
  const unknown = input.edits.find((edit) => !knownIds.has(edit.id));
  if (unknown !== undefined) {
    throw new QcOperationError(400, `Edit references unknown project-map feature ${unknown.id}.`, {
      code: CODE,
    });
  }
  const duplicate = firstDuplicate(input.edits, (edit) => edit.id);
  if (duplicate !== undefined) {
    throw new QcOperationError(
      400,
      `Feature ${duplicate.id} is edited more than once in this request.`,
      {
        code: CODE,
      },
    );
  }

  let rawText: string;
  try {
    rawText = await readFile(primary.source.resolvedLocalPath, "utf8");
  } catch {
    throw new QcOperationError(500, "The project map could not be read.", { code: CODE });
  }
  const applied = applyFeatureEdits(rawText, [...input.edits]);
  try {
    await writeFile(primary.source.resolvedLocalPath, applied.text, "utf8");
  } catch {
    throw new QcOperationError(500, "The project map could not be written.", { code: CODE });
  }

  let committed: string;
  try {
    committed = (
      await committer.commit(
        result.target.resolvedPath,
        [primary.source.projectRelativePath],
        "qc: ratify/prioritize features",
      )
    ).sha;
  } catch (error) {
    // Roll back the on-disk edit on ANY commit failure. The hosted PR committer throws plain
    // Octokit/network errors (not CommitError), so gating rollback on CommitError left the
    // checkout dirty — later reads then served the uncommitted edit as if it were applied.
    await writeFile(primary.source.resolvedLocalPath, rawText, "utf8").catch(() => undefined);
    if (error instanceof CommitError) throw commitFailure(error, CODE);
    throw error;
  }
  return {
    path: primary.source.projectRelativePath,
    updated: applied.updated,
    unknownIds: applied.unknownIds,
    committed,
  };
}

export async function saveSourcesOp(
  input: QcSaveSourcesInput,
  committer: QcCommitter,
): Promise<QcSaveSourcesResult> {
  const CODE = "INVALID_PROJECT_SOURCE";
  const RELATIVE = ".quality/config/sources.yaml";
  const result = await scanOrThrow(input.projectPath, CODE);

  const sources: readonly HumanSource[] = input.sources.filter(
    (source) => source.origin === "human" || source.status !== "current",
  );
  const diagnostics = validateSources(sources);
  if (diagnostics.length > 0) {
    throw new QcOperationError(400, diagnostics[0]!.message, { code: CODE, diagnostics });
  }

  const configDirectory = path.join(result.target.resolvedPath, ".quality", "config");
  const sourcesPath = path.join(configDirectory, "sources.yaml");
  const original = await readFile(sourcesPath, "utf8").catch(() => undefined);
  await mkdir(configDirectory, { recursive: true });
  await writeFile(sourcesPath, serializeHumanSources([...sources]), "utf8");

  let committed: string;
  try {
    committed = (
      await committer.commit(result.target.resolvedPath, [RELATIVE], "qc: update project sources")
    ).sha;
  } catch (error) {
    // Roll back on ANY commit failure (hosted committer throws non-CommitError) so a failed
    // save never leaves an uncommitted file on the checkout.
    await (
      original === undefined
        ? rm(sourcesPath, { force: true })
        : writeFile(sourcesPath, original, "utf8")
    ).catch(() => undefined);
    if (error instanceof CommitError) throw commitFailure(error, CODE);
    throw error;
  }
  return {
    path: RELATIVE,
    sources,
    droppedCount: input.sources.length - sources.length,
    committed,
  };
}

export async function saveQualityMapOp(
  input: QcSaveQualityMapInput,
  committer: QcCommitter,
): Promise<QcSaveQualityMapResult> {
  const CODE = "INVALID_QUALITY_MAP_EDIT";
  const result = await scanOrThrow(input.projectPath, CODE);

  const qualityMap = result.qualityMaps.results.find(
    (candidate) => candidate.source.projectRelativePath === input.qualityMapPath,
  );
  if (qualityMap?.graph === undefined) {
    throw new QcOperationError(400, `No parsed quality map was found at ${input.qualityMapPath}.`, {
      code: CODE,
    });
  }

  const knownIds = new Set(qualityMap.graph.expectations.map((expectation) => expectation.localId));
  const unknownPolicy = (input.policyEdits ?? []).find((edit) => !knownIds.has(edit.id));
  if (unknownPolicy !== undefined) {
    throw new QcOperationError(
      400,
      `Edit references unknown quality-map check ${unknownPolicy.id}.`,
      { code: CODE },
    );
  }
  const unknownRemoval = (input.removeExpectationIds ?? []).find((id) => !knownIds.has(id));
  if (unknownRemoval !== undefined) {
    throw new QcOperationError(400, `Cannot remove unknown quality-map check ${unknownRemoval}.`, {
      code: CODE,
    });
  }
  const collision = (input.addExpectations ?? []).find((addition) => knownIds.has(addition.id));
  if (collision !== undefined) {
    throw new QcOperationError(400, `A check with id ${collision.id} already exists.`, {
      code: CODE,
    });
  }
  const duplicateAddition = firstDuplicate(input.addExpectations ?? [], (addition) => addition.id);
  if (duplicateAddition !== undefined) {
    throw new QcOperationError(
      400,
      `Duplicate new check id ${duplicateAddition.id} in this request.`,
      { code: CODE },
    );
  }
  const duplicatePolicy = firstDuplicate(input.policyEdits ?? [], (edit) => edit.id);
  if (duplicatePolicy !== undefined) {
    throw new QcOperationError(
      400,
      `Duplicate policy edit for check ${duplicatePolicy.id} in this request.`,
      {
        code: CODE,
      },
    );
  }
  const unknownAcceptance = (input.gapAcceptanceEdits ?? []).find((edit) => !knownIds.has(edit.id));
  if (unknownAcceptance !== undefined) {
    throw new QcOperationError(
      400,
      `Edit references unknown quality-map check ${unknownAcceptance.id}.`,
      {
        code: CODE,
      },
    );
  }
  const duplicateAcceptance = firstDuplicate(
    input.gapAcceptanceEdits ?? [],
    (edit) => `${edit.id}\0${edit.category}`,
  );
  if (duplicateAcceptance !== undefined) {
    throw new QcOperationError(
      400,
      `Duplicate gap acceptance edit for check ${duplicateAcceptance.id} (${duplicateAcceptance.category}) in this request.`,
      { code: CODE },
    );
  }
  const removalSet = new Set(input.removeExpectationIds ?? []);
  const conflictingPolicy = (input.policyEdits ?? []).find((edit) => removalSet.has(edit.id));
  if (conflictingPolicy !== undefined) {
    throw new QcOperationError(
      400,
      `Check ${conflictingPolicy.id} is both removed and policy-edited in this request.`,
      { code: CODE },
    );
  }
  const conflictingAddition = (input.addExpectations ?? []).find((addition) =>
    removalSet.has(addition.id),
  );
  if (conflictingAddition !== undefined) {
    throw new QcOperationError(
      400,
      `Check ${conflictingAddition.id} is both removed and re-added in this request.`,
      {
        code: CODE,
      },
    );
  }

  let rawText: string;
  try {
    rawText = await readFile(qualityMap.source.resolvedLocalPath, "utf8");
  } catch {
    throw new QcOperationError(500, "The quality map could not be read.", { code: CODE });
  }
  const applied = applyQualityMapEdits(rawText, {
    reviewCheckList: input.reviewCheckList,
    addExpectations: input.addExpectations,
    removeExpectationIds: input.removeExpectationIds,
    policyEdits: input.policyEdits,
    gapAcceptanceEdits: input.gapAcceptanceEdits,
  });
  try {
    await writeFile(qualityMap.source.resolvedLocalPath, applied.text, "utf8");
  } catch {
    throw new QcOperationError(500, "The quality map could not be written.", { code: CODE });
  }

  let committed: string;
  try {
    committed = (
      await committer.commit(
        result.target.resolvedPath,
        [qualityMap.source.projectRelativePath],
        "qc: edit quality map (curate checks / ratify / set proof policy)",
      )
    ).sha;
  } catch (error) {
    // Roll back on ANY commit failure (hosted committer throws non-CommitError).
    await writeFile(qualityMap.source.resolvedLocalPath, rawText, "utf8").catch(() => undefined);
    if (error instanceof CommitError) throw commitFailure(error, CODE);
    throw error;
  }
  return {
    path: qualityMap.source.projectRelativePath,
    updated: applied.updated,
    unknownIds: applied.unknownIds,
    committed,
  };
}

export async function saveObservationSetsOp(
  input: QcSaveObservationSetsInput,
  committer: QcCommitter,
): Promise<QcSaveObservationSetsResult> {
  const CODE = "INVALID_OBSERVATION_SET_EDIT";
  const RELATIVE = ".quality/config/observation-sets.yaml";
  const result = await scanOrThrow(input.projectPath, CODE);

  const knownProfileIds = new Set(
    (result.observationSourceProfiles.primary?.document?.profiles ?? []).map(
      (profile) => profile.id,
    ),
  );
  const diagnostics: ScanDiagnostic[] = [];
  const seenSetIds = new Set<string>();
  for (const set of input.observationSets) {
    if (seenSetIds.has(set.id)) {
      diagnostics.push(diag(CODE, `Observation set id ${set.id} is defined more than once.`));
    }
    seenSetIds.add(set.id);
    const seenProfileIds = new Set<string>();
    for (const profileId of set.profileIds) {
      if (!knownProfileIds.has(profileId)) {
        diagnostics.push(
          diag(
            CODE,
            `Observation set ${set.id} references unknown observation source profile ${profileId}.`,
          ),
        );
      }
      if (seenProfileIds.has(profileId)) {
        diagnostics.push(
          diag(
            CODE,
            `Observation set ${set.id} lists observation source profile ${profileId} more than once.`,
          ),
        );
      }
      seenProfileIds.add(profileId);
    }
  }
  if (diagnostics.length > 0) {
    throw new QcOperationError(400, diagnostics[0]!.message, { code: CODE, diagnostics });
  }

  const sets: readonly ObservationSet[] = input.observationSets.map((set) => ({
    id: set.id,
    name: set.name,
    ...(set.description === undefined ? {} : { description: set.description }),
    profiles: set.profileIds.map((profileId) => ({ profileId })),
  }));

  const configDirectory = path.join(result.target.resolvedPath, ".quality", "config");
  const setsPath = path.join(configDirectory, "observation-sets.yaml");
  const original = await readFile(setsPath, "utf8").catch(() => undefined);
  await mkdir(configDirectory, { recursive: true });
  await writeFile(setsPath, serializeObservationSets([...sets]), "utf8");

  let committed: string;
  try {
    committed = (
      await committer.commit(result.target.resolvedPath, [RELATIVE], "qc: wire observation sets")
    ).sha;
  } catch (error) {
    // Roll back on ANY commit failure (hosted committer throws non-CommitError).
    await (
      original === undefined ? rm(setsPath, { force: true }) : writeFile(setsPath, original, "utf8")
    ).catch(() => undefined);
    if (error instanceof CommitError) throw commitFailure(error, CODE);
    throw error;
  }
  return { path: RELATIVE, count: sets.length, committed };
}

export async function saveObservationSourcesOp(
  input: QcSaveObservationSourcesInput,
  committer: QcCommitter,
): Promise<QcSaveObservationSourcesResult> {
  const CODE = "INVALID_OBSERVATION_SOURCE_EDIT";
  const RELATIVE = ".quality/config/observation-sources.yaml";
  const result = await scanOrThrow(input.projectPath, CODE);

  // Structural validation. The repo-in-installation rule is enforced at the web layer (which knows
  // the org's connected repos) before this op is called.
  const diagnostics: ScanDiagnostic[] = [];
  const seenIds = new Set<string>();
  for (const src of input.observationSources) {
    if (src.id.trim().length === 0 || src.name.trim().length === 0) {
      diagnostics.push(diag(CODE, "Each observation source needs a non-empty id and name."));
    }
    if (seenIds.has(src.id)) {
      diagnostics.push(diag(CODE, `Observation source id ${src.id} is defined more than once.`));
    }
    seenIds.add(src.id);
    if (src.observationPath.trim().length === 0) {
      diagnostics.push(diag(CODE, `Observation source ${src.id} needs an observation_path.`));
    }
    if (src.transport === "github-actions") {
      if (
        src.github === undefined ||
        src.github.repo.trim().length === 0 ||
        src.github.workflow.trim().length === 0 ||
        src.github.artifactNames.length === 0
      ) {
        diagnostics.push(
          diag(
            CODE,
            `GitHub Actions source ${src.id} needs a repo, workflow, and at least one artifact name.`,
          ),
        );
      }
    } else if (src.localFolder === undefined || src.localFolder.path.trim().length === 0) {
      diagnostics.push(diag(CODE, `Local-folder source ${src.id} needs a path.`));
    }
  }
  if (diagnostics.length > 0) {
    throw new QcOperationError(400, diagnostics[0]!.message, { code: CODE, diagnostics });
  }

  const profiles: readonly ObservationSourceProfile[] = input.observationSources.map((src) => ({
    id: src.id,
    name: src.name,
    description: src.description,
    transport: src.transport,
    observationPath: src.observationPath,
    requiredEnv: src.requiredEnv ?? [],
    sourceRefs: (src.sourceRefs ?? []).map((ref) => ({
      path: ref.path,
      url: ref.url,
      label: ref.label,
    })),
    github:
      src.github === undefined
        ? undefined
        : {
            repo: src.github.repo,
            workflow: src.github.workflow,
            artifactNames: [...src.github.artifactNames],
            branch: src.github.branch,
          },
    localFolder: src.localFolder === undefined ? undefined : { path: src.localFolder.path },
  }));

  const configDirectory = path.join(result.target.resolvedPath, ".quality", "config");
  const sourcesPath = path.join(configDirectory, "observation-sources.yaml");
  const original = await readFile(sourcesPath, "utf8").catch(() => undefined);
  await mkdir(configDirectory, { recursive: true });
  await writeFile(sourcesPath, serializeObservationSources([...profiles]), "utf8");

  let committed: string;
  try {
    committed = (
      await committer.commit(result.target.resolvedPath, [RELATIVE], "qc: edit observation sources")
    ).sha;
  } catch (error) {
    await (
      original === undefined
        ? rm(sourcesPath, { force: true })
        : writeFile(sourcesPath, original, "utf8")
    ).catch(() => undefined);
    if (error instanceof CommitError) throw commitFailure(error, CODE);
    throw error;
  }
  return { path: RELATIVE, count: profiles.length, committed };
}

export async function saveViewsOp(
  input: QcSaveViewsInput,
  committer: QcCommitter,
): Promise<QcSaveViewsResult> {
  const CODE = "INVALID_SAVED_VIEW";
  const RELATIVE = ".quality/config/views.yaml";
  const result = await scanOrThrow(input.projectPath, CODE);

  const projectMap = result.projectMaps.primary?.map;
  if (projectMap === undefined) {
    throw new QcOperationError(
      400,
      "A primary project map is required before saved QC views can be edited.",
      {
        code: CODE,
      },
    );
  }

  const diagnostics: ScanDiagnostic[] = [];
  const knownFeatureIds = new Set(projectMap.features.map((feature) => feature.id));
  const seenViewIds = new Set<string>();
  input.views.forEach((view) => {
    if (seenViewIds.has(view.id)) {
      diagnostics.push(diag(CODE, `Saved view id ${view.id} is defined more than once.`));
      return;
    }
    seenViewIds.add(view.id);
    if (view.featureIds.length === 0) {
      diagnostics.push(diag(CODE, `Saved view ${view.id} must contain at least one feature.`));
    }
    const seenFeatureIds = new Set<string>();
    view.featureIds.forEach((featureId) => {
      if (seenFeatureIds.has(featureId)) {
        diagnostics.push(
          diag(CODE, `Saved view ${view.id} lists feature ${featureId} more than once.`),
        );
        return;
      }
      seenFeatureIds.add(featureId);
      if (!knownFeatureIds.has(featureId)) {
        diagnostics.push(
          diag(CODE, `Saved view ${view.id} references unknown project-map feature ${featureId}.`),
        );
      }
    });
  });
  if (diagnostics.length > 0) {
    throw new QcOperationError(400, diagnostics[0]!.message, { code: CODE, diagnostics });
  }

  const configDirectory = path.join(result.target.resolvedPath, ".quality", "config");
  const configPath = path.join(configDirectory, "views.yaml");
  const original = await readFile(configPath, "utf8").catch(() => undefined);
  await mkdir(configDirectory, { recursive: true });
  await writeFile(
    configPath,
    stringify({
      views: input.views.map((view) => ({
        id: view.id,
        name: view.name,
        ...(view.description === undefined || view.description.length === 0
          ? {}
          : { description: view.description }),
        feature_ids: view.featureIds,
      })),
    }),
    "utf8",
  );

  // Commit like every other save op — otherwise views.yaml is a dangling uncommitted worktree file
  // that the hosted draft flow's branch switches would destroy (checkout) or collide with (merge).
  // Roll the written file back on commit failure so a failed save never leaves it dangling.
  let committed: string;
  try {
    committed = (
      await committer.commit(result.target.resolvedPath, [RELATIVE], "qc: update saved views")
    ).sha;
  } catch (error) {
    await (
      original === undefined
        ? rm(configPath, { force: true })
        : writeFile(configPath, original, "utf8")
    ).catch(() => undefined);
    if (error instanceof CommitError) throw commitFailure(error, CODE);
    throw error;
  }

  const parsedBatch = parseSavedQcViews([
    { projectRelativePath: RELATIVE, resolvedLocalPath: configPath, sourcePattern: RELATIVE },
  ]);
  return { path: RELATIVE, views: parsedBatch.primary?.document?.views ?? [], committed };
}

// --- execute ops --------------------------------------------------------------

export async function executeObservationSetOp(
  input: QcExecuteObservationSetInput,
): Promise<QcExecuteObservationSetResult> {
  const scan = await scanProject({ projectPath: input.projectPath, mode: "scan" });
  if (scan.status === "failed") {
    throw new QcOperationError(
      400,
      scan.diagnostics[0]?.message ?? "The project path could not be scanned.",
      {
        code: "invalid-observation-set-project",
        diagnostics: scan.diagnostics,
      },
    );
  }
  const observationSet = findObservationSet(scan.observationSets, input.setId);
  if (observationSet === undefined) {
    throw new QcOperationError(
      404,
      `Observation set ${input.setId} was not found in the scanned repo.`,
      {
        code: "observation-set-not-found",
      },
    );
  }

  const execution = await runObservationSet({
    observationSet,
    observationSourceProfiles: scan.observationSourceProfiles.primary?.document?.profiles ?? [],
    projectRoot: scan.target.resolvedPath,
    selection: input.selection,
    env: input.env,
  });
  const resolution = resolveObservations(scan, execution);
  const scopedScan = applySavedQcView(scan, input.viewId) ?? scan;
  const usable = hasUsableProof({
    executionStatus: execution.status,
    resolutionStatus: resolution.status,
    observationCount: execution.observations.length,
  });
  const evaluations = usable
    ? evaluationGroups(scopedScan, resolution, execution.resolvedCommit)
    : [];
  const rollups = usable
    ? buildObservationContextQualityRollups({ result: scopedScan, groups: evaluations })
    : [];
  return {
    execution,
    resolution: {
      status: resolution.status,
      auditRows: resolution.auditRows,
      diagnostics: resolution.diagnostics,
    },
    rollups,
    evaluations,
  };
}

export async function executeObservationSourceOp(
  input: QcExecuteObservationSourceInput,
): Promise<QcExecuteObservationSourceResult> {
  const scan = await scanProject({ projectPath: input.projectPath, mode: "scan" });
  if (scan.status === "failed") {
    throw new QcOperationError(
      400,
      scan.diagnostics[0]?.message ?? "The project path could not be scanned.",
      {
        code: "invalid-observation-source-project",
        diagnostics: scan.diagnostics,
      },
    );
  }
  const profile = findObservationSourceProfile(scan.observationSourceProfiles, input.profileId);
  if (profile === undefined) {
    throw new QcOperationError(
      404,
      `Observation source profile ${input.profileId} was not found in the scanned repo.`,
      {
        code: "observation-source-profile-not-found",
      },
    );
  }

  const execution = await executeObservationSourceProfile({
    profile,
    projectRoot: scan.target.resolvedPath,
    selection: input.selection,
    env: input.env,
  });
  const resolution = resolveObservations(scan, execution);
  const usable = hasUsableProof({
    executionStatus: execution.status,
    resolutionStatus: resolution.status,
    observationCount: execution.observations.length,
  });
  const commit = input.selection?.commit ?? execution.selectedRun?.commit;
  const evaluations = usable ? evaluationGroups(scan, resolution, commit) : [];
  const rollups = usable
    ? buildObservationContextQualityRollups({ result: scan, groups: evaluations })
    : [];
  return {
    execution,
    resolution: {
      status: resolution.status,
      auditRows: resolution.auditRows,
      diagnostics: resolution.diagnostics,
    },
    rollups,
    evaluations,
  };
}
