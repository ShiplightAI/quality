import type { ArtifactReferenceModel } from "../evidence-view/types";
import type { GapRecord } from "../gap-triage/types";
import { diagnosticGuidanceFor } from "../project-index/diagnostic-guidance";
import type { IndexDiagnosticDetail } from "../project-index/types";
import type {
  ArtifactExplorerRecord,
  DetailPanelRecord,
  TargetSummary,
  WorkspaceDetailKind
} from "./types";

type DetailSourceAttribution = DetailPanelRecord["sourceAttribution"][number];

function field(label: string, value: string | number | undefined): { readonly label: string; readonly value: string } {
  return {
    label,
    value: value === undefined || value === "" ? "unavailable" : String(value)
  };
}

function dedupeSourceAttribution(
  references: readonly DetailSourceAttribution[]
): DetailPanelRecord["sourceAttribution"] {
  const seen = new Set<string>();
  const unique: DetailSourceAttribution[] = [];

  references.forEach((reference, index) => {
    const key =
      reference.path !== undefined
        ? `path:${reference.path}`
        : reference.url !== undefined
          ? `url:${reference.url}`
          : reference.label !== undefined
            ? `label:${reference.label}`
            : `unknown:${index}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    unique.push(reference);
  });

  return unique;
}

function sourceRefsFor(target: TargetSummary): DetailPanelRecord["sourceAttribution"] {
  return target.sourceRefs.length === 0 ? [{ label: "Source unavailable" }] : dedupeSourceAttribution(target.sourceRefs);
}

export function artifactReferenceFromExplorer(record: ArtifactExplorerRecord): ArtifactReferenceModel {
  const isUrl = record.pathOrUrl.startsWith("http://") || record.pathOrUrl.startsWith("https://");

  return {
    artifactId: record.artifactId,
    label: record.label,
    pathOrUrl: record.pathOrUrl,
    kind: isUrl ? "external_url" : record.pathOrUrl === "unavailable" ? "unknown" : "local_path",
    href: isUrl ? record.pathOrUrl : undefined,
    clickableFileLink: false,
    availability: record.displaySafety === "missing-reference" ? "unavailable" : "unverified",
    portability: isUrl ? "external" : record.pathOrUrl.startsWith("/") ? "absolute" : "relative",
    type: record.artifactKind,
    sourceAttribution: {
      sourceClassification: record.sourceType,
      referencePath: isUrl ? undefined : record.pathOrUrl,
      referenceLabel: record.label
    }
  };
}

export function detailForTarget(target: TargetSummary): DetailPanelRecord {
  return {
    kind: "target",
    id: target.targetId,
    title: target.name,
    status: target.status,
    sourceAttribution: sourceRefsFor(target),
    summary: "Feature summary and traceable source context.",
    fields: [
      field("Scope", target.scope),
      field("Source type", target.sourceType),
      field("Evidence confidence", target.evidenceConfidence),
      field("Structure confidence", target.structureConfidence),
      field("Quality checks", target.expectationCount),
      field("Evidence", target.evidenceCount),
      field("Diagnostics", target.diagnosticCounts.error + target.diagnosticCounts.warning + target.diagnosticCounts.info)
    ],
    relatedRecords: target.riskIndicators.map((indicator) => field("Evidence gap", indicator)),
    artifacts: [],
    actions: ["Open overview", "Review evidence", "Inspect artifacts"]
  };
}

export function detailForDiagnostic(
  diagnostic: IndexDiagnosticDetail,
  target?: TargetSummary
): DetailPanelRecord {
  const guidance = diagnosticGuidanceFor(diagnostic);

  return {
    kind: "diagnostic",
    id: diagnostic.id,
    title: diagnostic.code,
    status: diagnostic.severity,
    sourceAttribution: target === undefined ? [] : sourceRefsFor(target),
    summary: diagnostic.message,
    fields: [
      field("Severity", diagnostic.severity),
      field("Code", diagnostic.code),
      field("Affected feature", diagnostic.affectedTargetId),
      field("Source path", diagnostic.sourcePath)
    ],
    relatedRecords: target === undefined ? [] : [field("Feature", target.name)],
    artifacts: [],
    actions: ["Review diagnostic source", "Refresh scan", "Copy coding-agent prompt"],
    guidance
  };
}

function artifactReferenceFromGapEvidence(
  record: GapRecord["evidence"][number],
  sourceClassification: GapRecord["sourceClassification"]
): ArtifactReferenceModel {
  const isUrl = record.pathOrUrl.startsWith("http://") || record.pathOrUrl.startsWith("https://");

  return {
    artifactId: record.evidenceId,
    label: record.label,
    pathOrUrl: record.pathOrUrl,
    kind: isUrl ? "external_url" : record.pathOrUrl === "unavailable" ? "unknown" : "local_path",
    href: isUrl ? record.pathOrUrl : undefined,
    clickableFileLink: false,
    availability: record.pathOrUrl === "unavailable" ? "unavailable" : "unverified",
    portability: isUrl ? "external" : record.pathOrUrl.startsWith("/") ? "absolute" : "relative",
    type: record.type,
    sourceAttribution: {
      sourceClassification,
      referencePath: isUrl ? undefined : record.pathOrUrl,
      referenceLabel: record.label
    }
  };
}

function usable(value: string | undefined | null): value is string {
  return value !== undefined && value !== null && value.length > 0 && value !== "unavailable";
}

function uniqueValues(values: readonly (string | undefined | null)[]): readonly string[] {
  return [...new Set(values.filter(usable))];
}

function isVerificationPath(path: string): boolean {
  return path.startsWith("tests/") || /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?|ya?ml)$/.test(path);
}

function problemForGap(gap: GapRecord): string {
  return usable(gap.residualRisk) ? gap.residualRisk : `${gap.categoryLabel}: ${gap.expectationTitle}`;
}

function verificationScopeForGap(gap: GapRecord, target?: TargetSummary): string {
  if (target !== undefined) {
    if (target.scope.toLowerCase() === "project") {
      return `${target.name} project-level verification`;
    }

    return target.featureKey === undefined ? target.name : `${target.featureKey} — ${target.name}`;
  }

  return gap.targetId;
}

function verificationScopeLabel(target?: TargetSummary): string {
  return target !== undefined && target.scope.toLowerCase() !== "project"
    ? "Affected feature spec"
    : "Verification scope";
}

function primaryGapSource(gap: GapRecord): DetailPanelRecord["sourceAttribution"] {
  if (usable(gap.sourceAttribution?.referencePath)) {
    return [{ label: "Quality evidence", path: gap.sourceAttribution.referencePath }];
  }

  const qualitySource = gap.sourceReferences.find((reference) =>
    reference.path?.endsWith("quality-map.yaml") === true
  );
  if (qualitySource !== undefined) {
    return [{ label: qualitySource.label ?? "Quality evidence", path: qualitySource.path }];
  }

  const firstSource = gap.sourceReferences.find((reference) =>
    usable(reference.path) || usable(reference.url) || usable(reference.label)
  );

  return firstSource === undefined ? [] : [firstSource];
}

function referenceValue(reference: DetailSourceAttribution): string | undefined {
  return reference.path ?? reference.url ?? reference.label;
}

function sourceOfTruthInputsForGap(input: {
  readonly primarySource?: string | undefined;
  readonly target?: TargetSummary | undefined;
}): readonly string[] {
  const targetSources = input.target?.sourceRefs ?? [];
  const sourceInputs = targetSources
    .filter((reference) => {
      const label = reference.label?.toLowerCase() ?? "";
      const value = referenceValue(reference)?.toLowerCase() ?? "";

      return (
        label.includes("feature spec") ||
        label.includes("feature plan") ||
        label.includes("feature tasks") ||
        label.includes("quality map") ||
        value.endsWith("/spec.md") ||
        value.endsWith("/plan.md") ||
        value.endsWith("/data-model.md") ||
        value.endsWith("/quickstart.md") ||
        value.endsWith("/tasks.md") ||
        value.endsWith("/quality-map.yaml")
      );
    })
    .map(referenceValue)
    .filter(usable);
  const specPath = sourceInputs.find((source) => /^specs\/[^/]+\/spec\.md$/.test(source));
  const conventionalSpecInputs = specPath === undefined
    ? []
    : [
        specPath.replace(/\/spec\.md$/, "/plan.md"),
        specPath.replace(/\/spec\.md$/, "/data-model.md"),
        specPath.replace(/\/spec\.md$/, "/quickstart.md"),
        specPath.replace(/\/spec\.md$/, "/tasks.md")
      ];

  return uniqueValues([
    input.primarySource,
    ...sourceInputs,
    ...conventionalSpecInputs
  ]);
}

function qualityExpectationReference(gap: GapRecord, primarySource?: string | undefined): string {
  if (primarySource === undefined || !gap.expectationId.includes("#expectation:")) {
    return gap.expectationId;
  }

  const expectationId = gap.expectationId.split("#expectation:").at(-1);

  return expectationId === undefined ? gap.expectationId : `${primarySource}#expectation:${expectationId}`;
}

function verificationChecksForGap(gap: GapRecord): readonly string[] {
  const diagnosticPaths = gap.diagnostics
    .map((diagnostic) => diagnostic.sourcePath)
    .filter((path): path is string =>
      usable(path) &&
      isVerificationPath(path)
    );
  const evidencePaths = gap.evidence
    .map((evidence) => evidence.path)
    .filter((path): path is string => usable(path) && isVerificationPath(path));
  const evidenceCommands = gap.evidence
    .map((evidence) => evidence.command)
    .filter(usable);

  return uniqueValues([...evidenceCommands, ...evidencePaths, ...diagnosticPaths]).slice(0, 8);
}

function verificationChecksDisplay(checks: readonly string[]): string {
  return checks.length === 0 ? "No exact verification command or test path is mapped." : checks.join(" · ");
}

function promptSection(title: string, values: readonly string[], emptyText = "unavailable"): readonly string[] {
  return [
    `${title}:`,
    ...(values.length === 0 ? [`- ${emptyText}`] : values.map((value) => `- ${value}`))
  ];
}

function gapGuidance(input: {
  readonly gap: GapRecord;
  readonly primarySource?: string | undefined;
  readonly problem: string;
  readonly scopeLabel: string;
  readonly target?: TargetSummary | undefined;
  readonly verificationChecks: readonly string[];
  readonly verificationScope: string;
}): DetailPanelRecord["guidance"] {
  const sourceOfTruthInputs = sourceOfTruthInputsForGap({
    primarySource: input.primarySource,
    target: input.target
  });
  const promptLines = [
    "Fix the evidence gap in this repo.",
    "",
    `${input.scopeLabel}: ${input.verificationScope}`,
    "",
    `Problem: ${input.problem}`,
    "",
    ...promptSection("Source-of-truth inputs", sourceOfTruthInputs),
    "",
    ...promptSection("Quality check", [qualityExpectationReference(input.gap, input.primarySource)]),
    "",
    ...promptSection(
      "Verification checks to rerun",
      input.verificationChecks,
      "No exact verification command or test path is mapped."
    ),
    "",
    "Task:",
    "Find the exact code, test, or evidence setup causing the evidence gap. Establish the concrete root cause from the source-of-truth inputs, make the smallest correct fix, add or update regression/manual evidence if needed, rerun the verification checks, and update quality evidence only if the verified result changes."
  ];

  return {
    title: "Fix evidence gap",
    explanation: input.problem,
    recommendedAction: `Read the source-of-truth inputs, rerun the listed verification checks for ${input.verificationScope}, make the smallest correct fix, then update evidence only if results change.`,
    agentPrompt: promptLines.join("\n")
  };
}

export function detailForGap(gap: GapRecord, target?: TargetSummary): DetailPanelRecord {
  const problem = problemForGap(gap);
  const verificationScope = verificationScopeForGap(gap, target);
  const scopeLabel = verificationScopeLabel(target);
  const verificationChecks = verificationChecksForGap(gap);
  const sourceAttribution = primaryGapSource(gap);
  const primarySource = sourceAttribution[0]?.path ?? sourceAttribution[0]?.url ?? sourceAttribution[0]?.label;

  return {
    kind: "gap",
    id: gap.gapId,
    title: problem,
    status: gap.categoryLabel,
    sourceAttribution,
    summary: `${scopeLabel}: ${verificationScope}`,
    fields: [
      field(scopeLabel, verificationScope),
      field("Verification checks", verificationChecksDisplay(verificationChecks)),
      field("Recommended action", gap.nextProof.text),
      field("Evidence state", `${gap.categoryLabel} · ${gap.evidenceState} · ${gap.evidenceDepth}`),
      field("Category", gap.categoryLabel),
      field("Priority", gap.priority),
      field("Quality check", gap.expectationTitle),
      field("Quality check category", gap.expectationCategory)
    ],
    relatedRecords: [
      field("Feature target", target?.name ?? gap.targetId),
      field("Quality check", gap.expectationId),
      ...gap.evidence.map((evidence) => field("Evidence", evidence.evidenceId)),
      ...gap.relatedCategoryIds.map((category) => field("Related gap", category))
    ],
    artifacts: gap.evidence.map((evidence) => artifactReferenceFromGapEvidence(evidence, gap.sourceClassification)),
    actions: ["Review verification checks", "Fix verification scope", "Rerun verification"],
    guidance: gapGuidance({
      gap,
      primarySource,
      problem,
      scopeLabel,
      target,
      verificationChecks,
      verificationScope
    })
  };
}

export function detailForArtifact(record: ArtifactExplorerRecord): DetailPanelRecord {
  return {
    kind: "artifact",
    id: record.artifactId,
    title: record.label,
    status: record.diagnosticState,
    sourceAttribution: [
      record.pathOrUrl.startsWith("http")
        ? { label: record.label, url: record.pathOrUrl }
        : { label: record.label, path: record.pathOrUrl }
    ],
    summary: "Display-only artifact reference. The quality scanner does not upload or mutate this file.",
    fields: [
      field("Kind", record.artifactKind),
      field("Path or URL", record.pathOrUrl),
      field("Display safety", record.displaySafety),
      field("Linked evidence", record.linkedEvidenceIds.length)
    ],
    relatedRecords: record.linkedEvidenceIds.map((id) => field("Evidence", id)),
    artifacts: [artifactReferenceFromExplorer(record)],
    actions: ["Display reference only"]
  };
}

export function fallbackDetail(input: {
  readonly kind: WorkspaceDetailKind;
  readonly id: string;
  readonly target?: TargetSummary;
}): DetailPanelRecord {
  return {
    kind: input.kind,
    id: input.id,
    title: input.id,
    status: "unavailable",
    sourceAttribution: input.target === undefined ? [] : sourceRefsFor(input.target),
    summary: "The selected detail is no longer available after refresh.",
    fields: [field("Detail id", input.id)],
    relatedRecords: [],
    artifacts: [],
    actions: ["Refresh scan", "Choose another item"]
  };
}
