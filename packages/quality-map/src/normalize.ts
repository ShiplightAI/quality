import { classifyStructureProvenance } from "./schema";
import type { StructureProvenance } from "./schema";
import { sourceAttributionFor } from "./source-location";
import type {
  NormalizedEvidenceEntry,
  NormalizedExpectation,
  NormalizedPolicyOverride,
  NormalizedQualityGraph,
  NormalizedQualityGraphResult,
  NormalizedResidualRisk,
  NormalizedSourceReference,
  NormalizedTask,
  QualityMapEntityType,
  QualityMapExpectationInput,
  QualityMapSource,
  QualityMapSourceAttribution,
  QualityMapValidationResult
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

// Map default: absent or invalid both resolve to "unspecified".
function resolveMapProvenance(value: unknown): StructureProvenance {
  const classification = classifyStructureProvenance(value);
  return classification.kind === "valid" ? classification.value : "unspecified";
}

// Per-expectation: a valid value wins, an invalid value is forced to
// "unspecified" (matching the validator warning), and an absent value inherits
// the map default.
function resolveExpectationProvenance(value: unknown, mapDefault: StructureProvenance): StructureProvenance {
  const classification = classifyStructureProvenance(value);
  if (classification.kind === "valid") {
    return classification.value;
  }
  return classification.kind === "invalid" ? "unspecified" : mapDefault;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeRepoRelativePath(value: unknown): string | undefined {
  const path = asString(value);
  if (path === undefined) {
    return undefined;
  }

  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function buildNormalizedId(
  source: QualityMapSource,
  entityType: QualityMapEntityType,
  localId: string
): string {
  return `${source.projectRelativePath}#${entityType}:${localId}`;
}

function attribution(
  result: QualityMapValidationResult,
  yamlPath: string
): QualityMapSourceAttribution {
  return sourceAttributionFor(result.source, yamlPath, result.rawText);
}

function normalizeSourceRef(
  result: QualityMapValidationResult,
  sourceRef: Record<string, unknown>,
  localId: string,
  yamlPath: string
): NormalizedSourceReference {
  return {
    normalizedId: buildNormalizedId(result.source, "source_ref", localId),
    localId,
    path: asString(sourceRef.path),
    url: asString(sourceRef.url),
    label: asString(sourceRef.label),
    anchor: asString(sourceRef.anchor),
    sourceAttribution: attribution(result, yamlPath)
  };
}

function normalizePolicyOverride(value: unknown): NormalizedPolicyOverride | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    preferredModalities: asStringArray(value.preferred_modalities),
    discouragedModalities: asStringArray(value.discouraged_modalities),
    requiredModalities: asStringArray(value.required_modalities),
    requiredContexts: asStringArray(value.required_contexts),
    requireGate: value.require_gate === true,
    notes: asString(value.notes)
  };
}

function validIdSet(ids: readonly string[]): ReadonlySet<string> {
  return new Set(ids);
}

export function normalizeQualityMap(
  result: QualityMapValidationResult
): NormalizedQualityGraphResult {
  if (result.status === "invalid" || result.document === undefined) {
    return {
      source: result.source,
      status: "invalid",
      diagnostics: result.diagnostics
    };
  }

  const document = result.document;
  const target = document.target;
  const documentProvenance = resolveMapProvenance(document.structure_provenance);

  if (!isRecord(target) || typeof target.id !== "string") {
    return {
      source: result.source,
      status: "invalid",
      diagnostics: result.diagnostics
    };
  }

  const invalidExpectations = validIdSet(result.invalidEntityIds.expectations);
  const invalidTasks = validIdSet(result.invalidEntityIds.tasks);
  const invalidEvidence = validIdSet(result.invalidEntityIds.evidence);

  const sourceRefs: NormalizedSourceReference[] = [];
  if (Array.isArray(target.source_refs)) {
    target.source_refs.forEach((sourceRef, sourceRefIndex) => {
      if (isRecord(sourceRef)) {
        sourceRefs.push(
          normalizeSourceRef(
            result,
            sourceRef,
            `target:${sourceRefIndex}`,
            `$.target.source_refs[${sourceRefIndex}]`
          )
        );
      }
    });
  }

  const expectations: NormalizedExpectation[] = [];
  const tasks: NormalizedTask[] = [];
  const evidenceEntries: NormalizedEvidenceEntry[] = [];
  const residualRisks: NormalizedResidualRisk[] = [];

  document.expectations?.forEach((expectation: QualityMapExpectationInput, expectationIndex) => {
    if (!isRecord(expectation) || typeof expectation.id !== "string" || typeof expectation.title !== "string") {
      return;
    }

    if (invalidExpectations.has(expectation.id) || invalidExpectations.has(`expectation:${expectationIndex}`)) {
      return;
    }

    const expectationYamlPath = `$.expectations[${expectationIndex}]`;
    const expectationId = buildNormalizedId(result.source, "expectation", expectation.id);
    const linkedTaskIds: string[] = [];
    const linkedEvidenceIds: string[] = [];
    const residualRiskIds: string[] = [];

    if (Array.isArray(expectation.source_refs)) {
      expectation.source_refs.forEach((sourceRef, sourceRefIndex) => {
        if (isRecord(sourceRef)) {
          sourceRefs.push(
            normalizeSourceRef(
              result,
              sourceRef,
              `${expectation.id}:source-ref:${sourceRefIndex}`,
              `${expectationYamlPath}.source_refs[${sourceRefIndex}]`
            )
          );
        }
      });
    }

    if (Array.isArray(expectation.tasks)) {
      expectation.tasks.forEach((task, taskIndex) => {
        if (!isRecord(task) || typeof task.id !== "string") {
          return;
        }
        if (invalidTasks.has(task.id) || invalidTasks.has(`${expectation.id}:task:${taskIndex}`)) {
          return;
        }

        const taskId = buildNormalizedId(result.source, "task", task.id);
        linkedTaskIds.push(taskId);
        tasks.push({
          normalizedId: taskId,
          localId: task.id,
          path: asString(task.path),
          status: asString(task.status),
          title: asString(task.title),
          expectationId,
          sourceAttribution: attribution(result, `${expectationYamlPath}.tasks[${taskIndex}]`)
        });
      });
    }

    if (Array.isArray(expectation.evidence)) {
      expectation.evidence.forEach((evidence, evidenceIndex) => {
        if (!isRecord(evidence) || typeof evidence.id !== "string") {
          return;
        }
        if (invalidEvidence.has(evidence.id) || invalidEvidence.has(`${expectation.id}:evidence:${evidenceIndex}`)) {
          return;
        }

        const evidenceId = buildNormalizedId(result.source, "evidence", evidence.id);
        linkedEvidenceIds.push(evidenceId);
        evidenceEntries.push({
          normalizedId: evidenceId,
          localId: evidence.id,
          type: asString(evidence.type) ?? "unknown",
          path: normalizeRepoRelativePath(evidence.path),
          testCase: asString(evidence.test_case),
          url: asString(evidence.url),
          command: asString(evidence.command),
          contexts: asStringArray(evidence.contexts),
          notes: asString(evidence.notes),
          expectationId,
          sourceAttribution: attribution(result, `${expectationYamlPath}.evidence[${evidenceIndex}]`)
        });
      });
    }

    if (isRecord(expectation.proof_gap) && typeof expectation.proof_gap.summary === "string") {
      const residualRiskLocalId = `${expectation.id}:proof-gap`;
      const residualRiskId = buildNormalizedId(result.source, "residual_risk", residualRiskLocalId);
      residualRiskIds.push(residualRiskId);
      residualRisks.push({
        normalizedId: residualRiskId,
        localId: residualRiskLocalId,
        text: expectation.proof_gap.summary,
        expectationId,
        sourceAttribution: attribution(result, `${expectationYamlPath}.proof_gap.summary`)
      });
    }

    expectations.push({
      normalizedId: expectationId,
      localId: expectation.id,
      title: expectation.title,
      description: asString(expectation.description),
      sourceType: asString(expectation.source_type),
      structureProvenance: resolveExpectationProvenance(expectation.structure_provenance, documentProvenance),
      category: asString(expectation.category),
      priority: asString(expectation.priority),
      linkedTaskIds,
      linkedEvidenceIds,
      residualRiskIds,
      policyOverride: normalizePolicyOverride(expectation.policy_override),
      acceptedGaps: asStringArray(expectation.accepted_gaps),
      proofGapNextStep:
        isRecord(expectation.proof_gap) &&
        (typeof expectation.proof_gap.next_step === "string" || expectation.proof_gap.next_step === null)
          ? expectation.proof_gap.next_step
          : undefined,
      sourceAttribution: attribution(result, expectationYamlPath)
    });
  });

  const graph: NormalizedQualityGraph = {
    source: result.source,
    target: {
      normalizedId: buildNormalizedId(result.source, "target", target.id),
      localId: target.id,
      name: asString(target.name) ?? target.id,
      scope: asString(target.scope),
      aliases: asStringArray(target.aliases),
      sourceAttribution: attribution(result, "$.target")
    },
    sourceRefs,
    expectations,
    tasks,
    evidence: evidenceEntries,
    residualRisks,
    checksReviewed: document.checks_reviewed === true
  };

  return {
    source: result.source,
    status: result.status,
    document,
    graph,
    diagnostics: result.diagnostics
  };
}
