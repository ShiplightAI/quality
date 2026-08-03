import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  parseQualityMaps,
  type NormalizedEvidenceEntry,
  type NormalizedExpectation,
  type NormalizedQualityGraph,
  type NormalizedQualityTarget,
  type NormalizedSourceReference
} from "@shiplightai/quality-map";
import {
  deriveExpectationAssessment,
  evidenceForExpectation,
  type StructuralExpectationAssessment
} from "../quality-structure/assessment";
import { qualityMapEvidenceRoots } from "../discovery/scan-patterns";
import { priorityWeight } from "../quality-structure/priority";

export interface FixPromptRecord {
  readonly target_id: string;
  readonly target_name: string;
  readonly target_scope: string;
  readonly quality_map: string;
  readonly expectation_id: string;
  readonly expectation_title: string;
  readonly priority: string;
  readonly priority_weight: number;
  readonly scope_label: string;
  readonly scope_value: string;
  readonly problem: string;
  readonly recommended_action: string;
  readonly source_of_truth_inputs: readonly string[];
  readonly quality_expectation: string;
  readonly verification_checks: readonly string[];
  readonly evidence_notes: readonly string[];
  readonly closure_mode: string;
  readonly closure_condition: string;
  readonly non_closing_changes: readonly string[];
  readonly prompt: string;
}

// Why each check is below target. Ordered by how fundamental the gap is (the
// primary mode is the most fundamental applicable one). Derived from the SAME
// structural assessment the scores use (deriveExpectationAssessment), never from
// the legacy embedded `evaluation` block that structural maps no longer carry.
type GapMode =
  | "missing_evidence"
  | "no_automated_proof"
  | "proof_gap"
  | "needs_gate"
  | "required_modality"
  | "required_context"
  | "confidence_upgrade";

const PRIORITY_RANK = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3],
  ["UNKNOWN", 4],
  ["", 4]
]);
const EMPTY_TEXT = new Set(["", "none", "n/a", "na", "null", "unavailable", "unknown"]);
const NON_RUNNABLE_COMMANDS = new Set([
  "no evidence artifact found",
  "see linked artifact or runbook",
  "quality-evidence map generation"
]);

function usefulText(value: string | undefined): boolean {
  const text = (value ?? "").trim();
  if (EMPTY_TEXT.has(text.toLowerCase())) {
    return false;
  }
  return !(text.startsWith("<") && text.endsWith(">"));
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function findQualityMaps(repo: string): string[] {
  const roots = qualityMapEvidenceRoots().map((root) => resolve(repo, root));
  const maps = roots.flatMap((root) => {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      return [];
    }
    return walkFiles(root).filter((path) => path.endsWith("/quality-map.yaml") || path.endsWith("/quality-map.yml"));
  });

  return [...new Set(maps)].sort();
}

function repoRelative(path: string, repo: string): string {
  const relativePath = relative(repo, path);
  return relativePath.startsWith("..") ? path : relativePath.replaceAll("\\", "/");
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (text.length === 0 || seen.has(text)) {
      continue;
    }
    seen.add(text);
    unique.push(text);
  }
  return unique;
}

function sourceRefValue(ref: NormalizedSourceReference): string {
  return (ref.path ?? ref.url ?? ref.label ?? "").trim();
}

function sourceInputs(
  repo: string,
  mapPath: string,
  graph: NormalizedQualityGraph,
  expectation: NormalizedExpectation
): string[] {
  const values = [repoRelative(mapPath, repo)];
  // Normalization flattens target-level and per-expectation source refs into one
  // graph list, so source-of-truth inputs are target-wide rather than strictly
  // per-check. That is acceptable context for a fixing agent.
  values.push(...graph.sourceRefs.map(sourceRefValue));

  const siblingTestSpec = resolve(dirname(mapPath), "test-spec.md");
  if (existsSync(siblingTestSpec)) {
    values.push(repoRelative(siblingTestSpec, repo));
  }

  const linkedTasks = new Set(expectation.linkedTaskIds);
  for (const task of graph.tasks) {
    if (task.path !== undefined && task.path.length > 0 && linkedTasks.has(task.normalizedId)) {
      values.push(task.path);
    }
  }

  const targetId = graph.target.localId;
  if (targetId.length > 0) {
    for (const filename of ["spec.md", "plan.md", "data-model.md", "quickstart.md", "tasks.md"]) {
      const candidate = resolve(repo, "specs", targetId, filename);
      if (existsSync(candidate)) {
        values.push(repoRelative(candidate, repo));
      }
    }
  }

  return dedupe(values);
}

function isVerificationPath(path: string): boolean {
  return path.startsWith("tests/") || /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?|ya?ml)$/.test(path);
}

function isRunnableCommand(command: string): boolean {
  if (!usefulText(command)) {
    return false;
  }
  return !NON_RUNNABLE_COMMANDS.has(command.toLowerCase());
}

function runnableCommands(command: string): string[] {
  if (!isRunnableCommand(command)) {
    return [];
  }
  const parts = command
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return [command];
  }
  return parts.every(isRunnableCommand) ? parts : [command];
}

function verificationDetails(evidence: readonly NormalizedEvidenceEntry[]): { checks: string[]; notes: string[] } {
  const checks: string[] = [];
  const notes: string[] = [];
  for (const entry of evidence) {
    const command = (entry.command ?? "").trim();
    const path = (entry.path ?? "").trim();
    const commands = runnableCommands(command);
    if (commands.length > 0) {
      checks.push(...commands);
    } else if (usefulText(command)) {
      notes.push(command);
    }
    if (path.length > 0 && isVerificationPath(path)) {
      checks.push(path);
    }
  }
  return {
    checks: dedupe(checks),
    notes: dedupe(notes)
  };
}

// A check is below target — and so warrants a fix prompt — when the structural
// assessment reports any gap reason (missing proof, proof gap, no automated
// proof, or an unmet gate/multi-layer/modality/context policy) OR its evidence
// confidence is not yet HIGH. This replaces the old logic that flagged every
// check because it read an absent `evaluation` block as "UNKNOWN".
function isBelowTarget(assessment: StructuralExpectationAssessment): boolean {
  return assessment.structuralGapReasons.length > 0 || assessment.evidenceConfidence.toUpperCase() !== "HIGH";
}

function proofGapText(graph: NormalizedQualityGraph, expectation: NormalizedExpectation): string {
  const ids = new Set(expectation.residualRiskIds);
  const texts = graph.residualRisks
    .filter((risk) => ids.has(risk.normalizedId))
    .map((risk) => risk.text.trim())
    .filter((text) => text.length > 0);
  if (texts.length > 0) {
    return texts.join(" ");
  }
  return (expectation.proofGapNextStep ?? "").trim();
}

function primaryGapMode(assessment: StructuralExpectationAssessment): GapMode {
  const reasons = new Set(assessment.structuralGapReasons);
  if (assessment.missingEvidence) {
    return "missing_evidence";
  }
  if (reasons.has("no_automated")) {
    return "no_automated_proof";
  }
  if (reasons.has("proof_gap")) {
    return "proof_gap";
  }
  if (reasons.has("needs_gate")) {
    return "needs_gate";
  }
  if (reasons.has("required_modalities")) {
    return "required_modality";
  }
  if (reasons.has("required_contexts")) {
    return "required_context";
  }
  // Automated proof exists with no unmet policy, but it is a single non-gated
  // modality, so evidence confidence sits at MEDIUM rather than HIGH.
  return "confidence_upgrade";
}

function problemText(
  assessment: StructuralExpectationAssessment,
  expectation: NormalizedExpectation,
  gapText: string
): string {
  const title = expectation.title || expectation.localId;
  if (assessment.missingEvidence) {
    return `No proof is mapped for "${title}" (NOT COVERED).`;
  }
  const reasons = assessment.structuralGapReasons.length > 0
    ? ` (gaps: ${assessment.structuralGapReasons.join(", ")})`
    : "";
  const base = `Evidence for "${title}" is ${assessment.status} at ${assessment.evidenceConfidence} confidence${reasons}.`;
  if (assessment.hasProofGap && gapText.length > 0) {
    return `${base} Declared proof gap: ${gapText}`;
  }
  return base;
}

function recommendedAction(
  mode: GapMode,
  assessment: StructuralExpectationAssessment,
  expectation: NormalizedExpectation,
  gapText: string
): string {
  switch (mode) {
    case "missing_evidence":
      return "Add linked automated proof (unit, contract, integration, or e2e) with a passing result and map it to this check.";
    case "no_automated_proof":
      return assessment.manualOnly
        ? "Replace or supplement the manual-only evidence with an automated test that exercises this behavior."
        : "Add automated (unit/contract/integration/e2e) proof; the current evidence is only supporting or indirect.";
    case "proof_gap":
      return gapText.length > 0
        ? `Close the declared proof gap, then map the resulting passing proof: ${gapText}`
        : "Close the declared proof gap and map current passing proof for this check.";
    case "needs_gate":
      return "Run the existing automated proof in a gated context (pr-ci / CI) so it blocks regressions.";
    case "required_modality":
      return `Add proof in the required modality(ies): ${(expectation.policyOverride?.requiredModalities ?? []).join(", ")}.`;
    case "required_context":
      return `Add proof running in the required context(s): ${(expectation.policyOverride?.requiredContexts ?? []).join(", ")}.`;
    case "confidence_upgrade":
      return "Raise evidence confidence to HIGH: run the automated proof in a gated (pr-ci) context, or add a second distinct automated modality.";
  }
}

function closureCondition(mode: GapMode): string {
  switch (mode) {
    case "missing_evidence":
      return "On the next scan, this check has linked automated proof with a passing result.";
    case "no_automated_proof":
      return "On the next scan, this check has automated proof, not only manual or supporting evidence.";
    case "proof_gap":
      return "On the next scan, the declared proof gap is closed and no residual risk remains open.";
    case "needs_gate":
      return "On the next scan, the automated proof runs in a gated (pr-ci) context.";
    case "required_modality":
      return "On the next scan, proof exists in every required modality.";
    case "required_context":
      return "On the next scan, proof runs in every required context.";
    case "confidence_upgrade":
      return "On the next scan, this check reaches HIGH evidence confidence (gated or multi-layer automated proof).";
  }
}

function nonClosingChanges(mode: GapMode): string[] {
  const changes = [
    "Editing quality-map.yaml, test-spec.md, or test-report.md without changing the underlying proof.",
    "Rewording the evidence description so it reads as stronger without adding proof."
  ];

  if (mode === "no_automated_proof" || mode === "confidence_upgrade") {
    changes.push("Refreshing or reframing the current weak, manual, or single-layer evidence without adding stronger automated proof.");
  }
  if (mode === "missing_evidence") {
    changes.push("Leaving the check without a linked passing test path or command result.");
  }
  if (mode === "needs_gate") {
    changes.push("Running the proof only locally without wiring it into the pr-ci gate.");
  }
  if (mode === "proof_gap") {
    changes.push("Marking the residual risk resolved without adding the missing proof.");
  }
  if (mode === "required_modality") {
    changes.push("Adding another test in an already-covered modality while the required modality is still absent.");
  }
  if (mode === "required_context") {
    changes.push("Running the proof only in the current context instead of adding a run in the required context.");
  }

  return dedupe(changes);
}

function scopeLine(target: NormalizedQualityTarget): readonly [string, string] {
  const targetId = target.localId;
  const targetName = target.name || targetId || "unknown target";
  if (targetId.length > 0 && targetId !== targetName) {
    return ["Affected feature", `${targetId} - ${targetName}`];
  }
  return ["Affected feature", targetName];
}

function priorityRank(priority: string): number {
  return PRIORITY_RANK.get(priority.toUpperCase()) ?? (PRIORITY_RANK.get("") ?? 4);
}

function buildPrompt(record: Omit<FixPromptRecord, "prompt">): string {
  const checks = record.verification_checks.length === 0
    ? ["No exact verification command or test path is mapped."]
    : record.verification_checks;
  const lines = [
    "Fix the evidence gap in this repo.",
    "",
    `${record.scope_label}: ${record.scope_value}`,
    "",
    `Problem: ${record.problem}`,
    "",
    `Recommended action: ${record.recommended_action}`,
    "",
    "Source-of-truth inputs:",
    ...record.source_of_truth_inputs.map((item) => `- ${item}`),
    "",
    "Quality check:",
    `- ${record.quality_expectation}`,
    "",
    `Closure mode: ${record.closure_mode}`,
    "",
    `Closure condition on next scan: ${record.closure_condition}`,
    "",
    "Changes that do not count as success by themselves:",
    ...record.non_closing_changes.map((item) => `- ${item}`),
    "",
    ...(record.evidence_notes.length === 0 ? [] : [
      "Evidence notes:",
      ...record.evidence_notes.map((item) => `- ${item}`),
      ""
    ]),
    "Verification checks to rerun:",
    ...checks.map((item) => `- ${item}`),
    "",
    "Task:",
    "Close the evidence gap in the smallest correct way. Establish the concrete root cause from the source-of-truth inputs, change implementation only when the inputs prove a product defect, add or update regression/manual evidence when needed, rerun the verification checks, and treat this task as complete only if the next scan stops reporting this quality check as open."
  ];
  return lines.join("\n");
}

export function collectFixPrompts(repo: string, includeCovered: boolean, targetFilter: string | undefined): FixPromptRecord[] {
  const records: FixPromptRecord[] = [];

  const sources = findQualityMaps(repo).map((path) => ({
    projectRelativePath: repoRelative(path, repo),
    resolvedLocalPath: path
  }));
  const batch = parseQualityMaps(sources);

  for (const result of batch.results) {
    const graph = result.graph;
    // Invalid maps are surfaced as diagnostics by the scan/analyze path; skip
    // them here rather than aborting every other map's prompts.
    if (graph === undefined) {
      continue;
    }
    const target = graph.target;
    if (targetFilter !== undefined && target.localId !== targetFilter) {
      continue;
    }

    const mapPath = result.source.resolvedLocalPath;
    const qualityMap = repoRelative(mapPath, repo);

    for (const expectation of graph.expectations) {
      const expectationId = expectation.localId;
      if (expectationId.length === 0 || expectationId.startsWith("<")) {
        continue;
      }

      const assessment = deriveExpectationAssessment(graph, expectation);
      if (!includeCovered && !isBelowTarget(assessment)) {
        continue;
      }

      const gapText = proofGapText(graph, expectation);
      const mode = primaryGapMode(assessment);
      const [scopeLabel, scopeValue] = scopeLine(target);
      const verification = verificationDetails(evidenceForExpectation(graph, expectation));
      const partialRecord: Omit<FixPromptRecord, "prompt"> = {
        target_id: target.localId,
        target_name: target.name,
        target_scope: target.scope ?? "",
        quality_map: qualityMap,
        expectation_id: expectationId,
        expectation_title: expectation.title,
        priority: expectation.priority ?? "UNKNOWN",
        priority_weight: priorityWeight(expectation.priority ?? ""),
        scope_label: scopeLabel,
        scope_value: scopeValue,
        problem: problemText(assessment, expectation, gapText),
        recommended_action: recommendedAction(mode, assessment, expectation, gapText),
        source_of_truth_inputs: sourceInputs(repo, mapPath, graph, expectation),
        quality_expectation: `${qualityMap}#expectation:${expectationId}`,
        verification_checks: verification.checks,
        evidence_notes: verification.notes,
        closure_mode: mode,
        closure_condition: closureCondition(mode),
        non_closing_changes: nonClosingChanges(mode)
      };
      records.push({
        ...partialRecord,
        prompt: buildPrompt(partialRecord)
      });
    }
  }

  return records.sort((left, right) => {
    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const riskDelta = right.priority_weight - left.priority_weight;
    if (riskDelta !== 0) {
      return riskDelta;
    }
    const targetDelta = left.target_id.localeCompare(right.target_id);
    return targetDelta === 0 ? left.expectation_id.localeCompare(right.expectation_id) : targetDelta;
  });
}

export function renderFixPromptsMarkdown(repo: string, records: readonly FixPromptRecord[]): string {
  const lines = [
    "# Quality Evidence Fix Prompts",
    "",
    `Repo: \`${repo}\``,
    `Prompts: ${records.length}`,
    ""
  ];

  if (records.length === 0) {
    lines.push("No structural evidence gaps were found in the quality maps.", "");
    return lines.join("\n");
  }

  records.forEach((record, index) => {
    const title = record.expectation_title || record.expectation_id;
    lines.push(
      `## ${index + 1}. ${record.priority} ${record.target_id} / ${title}`,
      "",
      `- Quality map: \`${record.quality_map}\``,
      `- Quality check: \`${record.expectation_id}\``,
      `- Priority: ${record.priority}`,
      "",
      "```text",
      record.prompt,
      "```",
      ""
    );
  });

  return lines.join("\n");
}

export function fixPromptsOutputPath(repo: string, output: string): string {
  return isAbsolute(output) ? output : resolve(repo, output);
}

export interface GenerateFixPromptsInput {
  readonly repo: string;
  readonly format?: "markdown" | "json";
  readonly output?: string;
  readonly limit?: number;
  readonly target?: string;
  readonly includeCovered?: boolean;
}

export interface GenerateFixPromptsResult {
  readonly output: string;
  readonly outputPath?: string;
  readonly records: readonly FixPromptRecord[];
}

export function generateFixPrompts(input: GenerateFixPromptsInput): GenerateFixPromptsResult {
  const repo = resolve(input.repo);
  if (!existsSync(repo) || !statSync(repo).isDirectory()) {
    throw new Error(`Repo path is not a directory: ${repo}`);
  }

  let records = collectFixPrompts(repo, input.includeCovered ?? false, input.target);
  if (input.limit !== undefined) {
    records = records.slice(0, input.limit);
  }

  const output = input.format === "json"
    ? JSON.stringify(records, null, 2)
    : renderFixPromptsMarkdown(repo, records);

  return {
    output,
    ...(input.output === undefined ? {} : { outputPath: fixPromptsOutputPath(repo, input.output) }),
    records
  };
}
