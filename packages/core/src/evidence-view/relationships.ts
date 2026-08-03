import type {
  NormalizedQualityGraph,
  QualityMapDiagnostic
} from "@shiplightai/quality-map";
import type {
  FallbackCoverageRow,
  FallbackEvidenceHint,
  FallbackTarget,
  MarkdownDiagnostic
} from "../markdown-fallback/types";
import type { IndexSourceReference } from "../project-index/types";
import { isGateContext, proofTier } from "../quality-structure/assessment";
import { artifactReferenceFromFallbackHint, artifactReferenceFromStructured } from "./artifact-links";
import { markdownAttribution, structuredAttribution, unavailable } from "./source-attribution";
import type {
  ArtifactReferenceModel,
  EvidenceCanonicalRecord,
  EvidenceDiagnostic,
  EvidenceExpectationGroup,
  EvidenceRelationship,
  EvidenceRelationshipRow,
  EvidenceResidualRiskNode,
  EvidenceSourceAttribution,
  EvidenceTaskNode
} from "./types";

function diagnosticId(prefix: string, index: number, code: string): string {
  return `${prefix}:${index}:${code}`;
}

export function structuredDiagnostic(
  diagnostic: QualityMapDiagnostic,
  index: number
): EvidenceDiagnostic {
  return {
    id: diagnosticId("structured-diagnostic", index, diagnostic.code),
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    sourcePath: diagnostic.mapPath,
    affectedId: diagnostic.affectedEntityId
  };
}

export function markdownDiagnostic(
  diagnostic: MarkdownDiagnostic,
  index: number
): EvidenceDiagnostic {
  return {
    id: diagnosticId("markdown-diagnostic", index, diagnostic.code),
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    sourcePath: diagnostic.artifactPath,
    affectedId: diagnostic.headingPath
  };
}

function relationship(input: {
  readonly kind: EvidenceRelationship["kind"];
  readonly fromId: string;
  readonly fromLabel: string;
  readonly toId: string;
  readonly toLabel: string;
  readonly sourceAttribution: EvidenceSourceAttribution;
}): EvidenceRelationship {
  return {
    id: `${input.kind}:${input.fromId}->${input.toId}`,
    ...input
  };
}

function sourceReferencesFor(graph: NormalizedQualityGraph): readonly IndexSourceReference[] {
  return [
    { label: "Quality map", path: graph.source.projectRelativePath },
    ...graph.sourceRefs.map((sourceRef) => ({
      label: sourceRef.label,
      path: sourceRef.path,
      url: sourceRef.url
    }))
  ];
}

function linkedExpectationIds(
  evidenceId: string,
  groups: readonly EvidenceExpectationGroup[]
): readonly string[] {
  return groups
    .filter((group) => group.rows.some((row) => row.evidenceId === evidenceId))
    .map((group) => group.expectationId);
}

export function buildStructuredEvidenceRelationships(input: {
  readonly graph: NormalizedQualityGraph;
  readonly diagnostics: readonly QualityMapDiagnostic[];
  readonly selectedExpectationId?: string;
}): {
  readonly expectationGroups: readonly EvidenceExpectationGroup[];
  readonly relationships: readonly EvidenceRelationship[];
  readonly canonicalEvidence: readonly EvidenceCanonicalRecord[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
} {
  const graph = input.graph;
  const diagnostics = input.diagnostics.map(structuredDiagnostic);
  const allRelationships: EvidenceRelationship[] = [];
  const sourceReferences = sourceReferencesFor(graph);

  const expectationGroups = graph.expectations.map((expectation) => {
    const expectationAttribution = structuredAttribution(expectation.sourceAttribution);
    const tasks: EvidenceTaskNode[] = graph.tasks
      .filter((task) => expectation.linkedTaskIds.includes(task.normalizedId))
      .map((task) => ({
        taskId: task.normalizedId,
        title: unavailable(task.title ?? task.localId),
        path: unavailable(task.path),
        status: unavailable(task.status),
        sourceAttribution: structuredAttribution(task.sourceAttribution)
      }));
    const residualRisks: EvidenceResidualRiskNode[] = graph.residualRisks
      .filter((risk) => expectation.residualRiskIds.includes(risk.normalizedId))
      .map((risk) => ({
        residualRiskId: risk.normalizedId,
        text: risk.text,
        sourceAttribution: structuredAttribution(risk.sourceAttribution)
      }));
    const expectationRelationships: EvidenceRelationship[] = [
      relationship({
        kind: "target-expectation",
        fromId: graph.target.normalizedId,
        fromLabel: graph.target.name,
        toId: expectation.normalizedId,
        toLabel: expectation.title,
        sourceAttribution: expectationAttribution
      }),
      ...tasks.map((task) =>
        relationship({
          kind: "expectation-task",
          fromId: expectation.normalizedId,
          fromLabel: expectation.title,
          toId: task.taskId,
          toLabel: task.title,
          sourceAttribution: task.sourceAttribution
        })
      ),
      ...residualRisks.map((risk) =>
        relationship({
          kind: "expectation-residual-risk",
          fromId: expectation.normalizedId,
          fromLabel: expectation.title,
          toId: risk.residualRiskId,
          toLabel: risk.text,
          sourceAttribution: risk.sourceAttribution
        })
      )
    ];

    const rows = graph.evidence
      .filter((evidence) => expectation.linkedEvidenceIds.includes(evidence.normalizedId))
      .map((evidence) => {
        const artifacts = [
          artifactReferenceFromStructured({
            normalizedId: `${evidence.normalizedId}:path`,
            localId: `${evidence.localId}:path`,
            path: evidence.path,
            url: evidence.url,
            label: evidence.path ?? evidence.url ?? evidence.localId,
            type: evidence.type,
            sourceAttribution: evidence.sourceAttribution
          })
        ].filter((artifact) => artifact.pathOrUrl !== "unavailable");
        const rowRelationships: EvidenceRelationship[] = [
          relationship({
            kind: "expectation-evidence",
            fromId: expectation.normalizedId,
            fromLabel: expectation.title,
            toId: evidence.normalizedId,
            toLabel: evidence.localId,
            sourceAttribution: structuredAttribution(evidence.sourceAttribution)
          })
        ];

        for (const artifact of artifacts) {
          rowRelationships.push(
            relationship({
              kind: "latest-result-artifact",
              fromId: evidence.normalizedId,
              fromLabel: evidence.localId,
              toId: artifact.artifactId,
              toLabel: artifact.label,
              sourceAttribution: artifact.sourceAttribution
            })
          );
        }

        const rowDiagnostics = diagnostics.filter((diagnostic) => diagnostic.affectedId === evidence.localId);

        return {
          rowId: `${expectation.normalizedId}:${evidence.normalizedId}`,
          expectationId: expectation.normalizedId,
          evidenceId: evidence.normalizedId,
          evidenceLabel: evidence.localId,
          evidenceType: evidence.type,
          evidenceState: "unavailable",
          evidenceDepth: proofTier(evidence.type),
          tasks,
          artifacts,
          residualRisks,
          relationships: rowRelationships,
          diagnostics: rowDiagnostics,
          sourceClassification: "structured_quality_map"
        } satisfies EvidenceRelationshipRow;
      });

    const allGroupRelationships = [
      ...expectationRelationships,
      ...rows.flatMap((row) => row.relationships)
    ];
    allRelationships.push(...allGroupRelationships);

    return {
      expectationId: expectation.normalizedId,
      title: expectation.title,
      description: unavailable(expectation.description),
      priority: unavailable(expectation.priority),
      category: unavailable(expectation.category),
      sourceClassification: "structured_quality_map",
      sourceAttribution: expectationAttribution,
      sourceReferences,
      tasks,
      rows:
        rows.length > 0
          ? rows
          : [
              {
                rowId: `${expectation.normalizedId}:missing-evidence`,
                expectationId: expectation.normalizedId,
                evidenceLabel: "No evidence",
                evidenceType: "missing",
                evidenceState: "unavailable",
                evidenceDepth: "missing",
                tasks,
                artifacts: [],
                residualRisks,
                relationships: expectationRelationships,
                diagnostics: diagnostics.filter((diagnostic) => diagnostic.affectedId === expectation.localId),
                sourceClassification: "structured_quality_map"
              }
            ],
      residualRisks,
      diagnostics: diagnostics.filter((diagnostic) => diagnostic.affectedId === expectation.localId),
      isSelected: input.selectedExpectationId === expectation.normalizedId
    } satisfies EvidenceExpectationGroup;
  });

  const uniqueEvidence = [...new Map(graph.evidence.map((evidence) => [evidence.normalizedId, evidence])).values()];
  const canonicalEvidence = uniqueEvidence.map((evidence) => {
    return {
      evidenceId: evidence.normalizedId,
      localId: evidence.localId,
      label: evidence.localId,
      type: evidence.type,
      pathOrUrl: unavailable(evidence.path ?? evidence.url),
      command: unavailable(evidence.command),
      depth: proofTier(evidence.type),
      contexts: evidence.contexts,
      notes: unavailable(evidence.notes),
      gated: evidence.contexts.length === 0 ? "unavailable" : evidence.contexts.some(isGateContext) ? "gated" : "not gated",
      sourceClassification: "structured_quality_map",
      sourceAttribution: structuredAttribution(evidence.sourceAttribution),
      linkedExpectationIds: linkedExpectationIds(evidence.normalizedId, expectationGroups)
    } satisfies EvidenceCanonicalRecord;
  });

  return {
    expectationGroups,
    relationships: allRelationships,
    canonicalEvidence,
    diagnostics: [
      ...diagnostics,
      ...expectationGroups.flatMap((group) => group.rows.flatMap((row) => row.diagnostics))
    ]
  };
}

function fallbackEvidenceLabel(row: FallbackCoverageRow | undefined, hint: FallbackEvidenceHint | undefined): string {
  return unavailable(row?.evidence ?? hint?.label ?? hint?.value);
}

export function buildFallbackEvidenceRelationships(input: {
  readonly target: FallbackTarget;
  readonly selectedExpectationId?: string;
}): {
  readonly expectationGroups: readonly EvidenceExpectationGroup[];
  readonly relationships: readonly EvidenceRelationship[];
  readonly canonicalEvidence: readonly EvidenceCanonicalRecord[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
} {
  const target = input.target;
  const diagnostics = target.diagnostics.map(markdownDiagnostic);
  const relationships: EvidenceRelationship[] = [];
  const sourceReferences: readonly IndexSourceReference[] = target.sourceArtifacts.map((source) => ({
    label: source.artifactType === "test_spec" ? "Test spec" : "Test report",
    path: source.projectRelativePath
  }));

  const groups = target.sections.map((section, sectionIndex) => {
    const coverageRow = target.coverageRows[sectionIndex];
    const hints = target.evidenceHints.length > 0 ? target.evidenceHints : [];
    const expectationId = `${target.targetIdentity}#section:${sectionIndex}`;
    const attribution = markdownAttribution(section.sourceAttribution);
    const riskText = coverageRow?.residualRisk ?? target.residualRisks[0]?.previewText;
    const residualRisks: EvidenceResidualRiskNode[] =
      riskText === undefined
        ? []
        : [
            {
              residualRiskId: `${expectationId}:residual-risk`,
              text: riskText,
              sourceAttribution:
                coverageRow?.sourceAttribution !== undefined
                  ? markdownAttribution(coverageRow.sourceAttribution)
                  : attribution
            }
          ];
    const targetRelationship = relationship({
      kind: "target-expectation",
      fromId: target.targetIdentity,
      fromLabel: target.displayLabel,
      toId: expectationId,
      toLabel: section.headingText,
      sourceAttribution: attribution
    });
    const rows: EvidenceRelationshipRow[] =
      hints.length === 0 && coverageRow?.evidence === undefined
        ? [
            {
              rowId: `${expectationId}:fallback-missing`,
              expectationId,
              evidenceLabel: "No evidence hint",
              evidenceType: "missing",
              evidenceState: coverageRow?.result ?? "unavailable",
              evidenceDepth: "parsed markdown fallback",
              tasks: [],
              artifacts: [],
              residualRisks,
              relationships: [targetRelationship],
              diagnostics: [],
              sourceClassification: "parsed_markdown_fallback"
            }
          ]
        : (hints.length > 0 ? hints : [undefined]).map((hint, hintIndex) => {
            const evidenceId = `${expectationId}#fallback-evidence:${hintIndex}`;
            const sourceAttribution =
              hint === undefined ? attribution : markdownAttribution(hint.sourceAttribution);
            const artifacts: ArtifactReferenceModel[] =
              hint === undefined ? [] : [artifactReferenceFromFallbackHint(expectationId, hint, hintIndex)];
            const rowRelationships = [
              relationship({
                kind: "expectation-evidence",
                fromId: expectationId,
                fromLabel: section.headingText,
                toId: evidenceId,
                toLabel: fallbackEvidenceLabel(coverageRow, hint),
                sourceAttribution
              }),
              ...artifacts.map((artifact) =>
                relationship({
                  kind: "latest-result-artifact",
                  fromId: evidenceId,
                  fromLabel: fallbackEvidenceLabel(coverageRow, hint),
                  toId: artifact.artifactId,
                  toLabel: artifact.label,
                  sourceAttribution: artifact.sourceAttribution
                })
              )
            ];
            relationships.push(...rowRelationships);

            return {
              rowId: `${expectationId}:${evidenceId}`,
              expectationId,
              evidenceId,
              evidenceLabel: fallbackEvidenceLabel(coverageRow, hint),
              evidenceType: hint?.type ?? "parsed markdown fallback",
              evidenceState: coverageRow?.result ?? "unavailable",
              evidenceDepth: "parsed markdown fallback",
              tasks: [],
              artifacts,
              residualRisks,
              relationships: rowRelationships,
              diagnostics: [],
              sourceClassification: "parsed_markdown_fallback"
            } satisfies EvidenceRelationshipRow;
          });

    relationships.push(targetRelationship);

    for (const risk of residualRisks) {
      relationships.push(
        relationship({
          kind: "expectation-residual-risk",
          fromId: expectationId,
          fromLabel: section.headingText,
          toId: risk.residualRiskId,
          toLabel: risk.text,
          sourceAttribution: risk.sourceAttribution
        })
      );
    }

    return {
      expectationId,
      title: section.headingText,
      description: unavailable(section.previewText),
      priority: "unknown",
      category: section.canonicalSectionType ?? "narrative",
      sourceClassification: "parsed_markdown_fallback",
      sourceAttribution: attribution,
      sourceReferences,
      tasks: [],
      rows,
      residualRisks,
      diagnostics: diagnostics.filter((diagnostic) => diagnostic.affectedId === section.headingPath),
      isSelected: input.selectedExpectationId === expectationId
    } satisfies EvidenceExpectationGroup;
  });

  const canonicalEvidence = groups
    .flatMap((group) => group.rows)
    .filter((row) => row.evidenceId !== undefined)
    .map((row) => ({
      evidenceId: row.evidenceId ?? row.rowId,
      localId: row.evidenceLabel,
      label: row.evidenceLabel,
      type: row.evidenceType,
      pathOrUrl: row.artifacts[0]?.pathOrUrl ?? "unavailable",
      command: row.evidenceType === "command" ? row.evidenceLabel : "unavailable",
      depth: row.evidenceDepth,
      contexts: [],
      notes: "unavailable",
      gated: "unavailable",
      sourceClassification: "parsed_markdown_fallback",
      sourceAttribution: row.relationships[0]?.sourceAttribution ?? groups[0]?.sourceAttribution ?? {
        sourceClassification: "parsed_markdown_fallback"
      },
      linkedExpectationIds: [row.expectationId]
    } satisfies EvidenceCanonicalRecord));

  return {
    expectationGroups: groups,
    relationships,
    canonicalEvidence,
    diagnostics
  };
}
