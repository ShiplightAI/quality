import type {
  EvidenceDrawerExpectationContext,
  EvidenceDrawerField,
  EvidenceDrawerModel,
  EvidenceRelationshipRow,
  EvidenceView
} from "./types";

function contextFor(row: EvidenceRelationshipRow, view: EvidenceView): EvidenceDrawerExpectationContext {
  const group = view.expectationGroups.find((candidate) => candidate.expectationId === row.expectationId);

  return {
    expectationId: row.expectationId,
    title: group?.title ?? row.expectationId
  };
}

function fieldsFor(view: EvidenceView, row: EvidenceRelationshipRow): readonly EvidenceDrawerField[] {
  const canonical = row.evidenceId === undefined
    ? undefined
    : view.canonicalEvidence.find((candidate) => candidate.evidenceId === row.evidenceId);

  return [
    { label: "Evidence id", value: row.evidenceId ?? "unavailable" },
    { label: "Type", value: canonical?.type ?? row.evidenceType },
    { label: "Path or URL", value: canonical?.pathOrUrl ?? row.artifacts[0]?.pathOrUrl ?? "unavailable" },
    { label: "Command", value: canonical?.command ?? "unavailable" },
    { label: "Proof tier", value: canonical?.depth ?? row.evidenceDepth },
    { label: "Contexts", value: canonical?.contexts.join(", ") || "unavailable" },
    { label: "Notes", value: canonical?.notes ?? "unavailable" },
    { label: "Gated", value: canonical?.gated ?? "unavailable" },
    { label: "Structural state", value: row.evidenceState }
  ];
}

export function buildEvidenceDrawer(input: {
  readonly view: EvidenceView;
  readonly evidenceId?: string;
  readonly expectationId?: string;
}): EvidenceDrawerModel | undefined {
  if (input.evidenceId === undefined) {
    return undefined;
  }

  const matchingRows = input.view.expectationGroups.flatMap((group) =>
    group.rows.filter((row) => row.evidenceId === input.evidenceId)
  );
  const selectedRow =
    matchingRows.find((row) => row.expectationId === input.expectationId) ?? matchingRows[0];

  if (selectedRow === undefined) {
    return {
      state: "missingEvidence",
      evidenceId: input.evidenceId,
      title: "Evidence unavailable",
      otherLinkedExpectations: [],
      fields: [{ label: "Evidence id", value: input.evidenceId }],
      artifacts: [],
      residualRisks: [],
      diagnostics: [
        {
          id: `missing-evidence:${input.evidenceId}`,
          severity: "warning",
          code: "MISSING_EVIDENCE_SELECTION",
          message: "The selected evidence is no longer available after refresh.",
          affectedId: input.evidenceId
        }
      ]
    };
  }

  const selectedExpectation = contextFor(selectedRow, input.view);
  const otherLinkedExpectations = matchingRows
    .filter((row) => row.expectationId !== selectedRow.expectationId)
    .map((row) => contextFor(row, input.view));
  const canonical = input.view.canonicalEvidence.find((candidate) => candidate.evidenceId === selectedRow.evidenceId);

  return {
    state: "ready",
    evidenceId: input.evidenceId,
    title: selectedRow.evidenceLabel,
    selectedExpectation,
    otherLinkedExpectations,
    fields: fieldsFor(input.view, selectedRow),
    latestResult: selectedRow.latestResult,
    artifacts: selectedRow.artifacts,
    residualRisks: selectedRow.residualRisks,
    diagnostics: selectedRow.diagnostics,
    sourceAttribution: canonical?.sourceAttribution ?? selectedRow.relationships[0]?.sourceAttribution
  };
}
