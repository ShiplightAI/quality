import { createQualityMapDiagnostic, graphStatusFromDiagnostics } from "./diagnostics";
import {
  QUALITY_MAP_EVIDENCE_FIELDS,
  QUALITY_MAP_EXPECTATION_FIELDS,
  QUALITY_MAP_POLICY_OVERRIDE_FIELDS,
  QUALITY_MAP_PROOF_GAP_FIELDS,
  QUALITY_MAP_SOURCE_REF_FIELDS,
  QUALITY_MAP_TARGET_FIELDS,
  QUALITY_MAP_TASK_FIELDS,
  QUALITY_MAP_TOP_LEVEL_FIELDS,
  STRUCTURE_PROVENANCE_VALUES,
  classifyStructureProvenance
} from "./schema";
import type {
  InvalidQualityMapEntityIds,
  ParsedQualityMap,
  QualityMapDiagnostic,
  QualityMapExpectationInput,
  QualityMapValidationResult
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownFieldDiagnostics(
  parsed: ParsedQualityMap,
  value: Record<string, unknown>,
  supportedFields: readonly string[],
  yamlPath: string
): QualityMapDiagnostic[] {
  const supported = new Set(supportedFields);
  return Object.keys(value)
    .filter((key) => !supported.has(key))
    .map((key) =>
      createQualityMapDiagnostic(parsed.source, {
        severity: "warning",
        code: "UNKNOWN_FIELD",
        message: `Unknown quality-map field '${key}' is ignored.`,
        yamlPath: yamlPathForChild(yamlPath, key),
        rawText: parsed.rawText
      })
    );
}

function yamlPathForChild(parentPath: string, key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? `${parentPath}.${key}`
    : `${parentPath}[${JSON.stringify(key)}]`;
}

function duplicateIds(records: readonly unknown[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const record of records) {
    if (!isRecord(record) || !isString(record.id)) {
      continue;
    }

    if (seen.has(record.id)) {
      duplicates.add(record.id);
    }
    seen.add(record.id);
  }

  return duplicates;
}

function emptyInvalidEntities(): InvalidQualityMapEntityIds {
  return {
    expectations: [],
    tasks: [],
    evidence: []
  };
}

function pushShapeDiagnostic(
  diagnostics: QualityMapDiagnostic[],
  parsed: ParsedQualityMap,
  yamlPath: string,
  message: string,
  affectedEntityId?: string
): void {
  diagnostics.push(
    createQualityMapDiagnostic(parsed.source, {
      severity: "error",
      code: "INVALID_FIELD_SHAPE",
      message,
      yamlPath,
      rawText: parsed.rawText,
      affectedEntityId
    })
  );
}

function validateStructureProvenance(
  parsed: ParsedQualityMap,
  diagnostics: QualityMapDiagnostic[],
  value: unknown,
  yamlPath: string
): void {
  // Optional everywhere: absence (missing/null/empty) defaults to "unspecified"
  // silently. Only flag values that are present but outside the accepted
  // vocabulary.
  if (classifyStructureProvenance(value).kind !== "invalid") {
    return;
  }

  diagnostics.push(
    createQualityMapDiagnostic(parsed.source, {
      severity: "warning",
      code: "INVALID_STRUCTURE_PROVENANCE",
      message: `structure_provenance must be one of ${STRUCTURE_PROVENANCE_VALUES.join(", ")}; treating as unspecified.`,
      yamlPath,
      rawText: parsed.rawText
    })
  );
}

function validateSourceRefs(
  parsed: ParsedQualityMap,
  diagnostics: QualityMapDiagnostic[],
  value: unknown,
  yamlPath: string
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushShapeDiagnostic(diagnostics, parsed, yamlPath, "Source refs must be an array.");
    return;
  }

  value.forEach((sourceRef, index) => {
    const path = `${yamlPath}[${index}]`;
    if (!isRecord(sourceRef)) {
      pushShapeDiagnostic(diagnostics, parsed, path, "Each source ref must be an object.");
      return;
    }

    diagnostics.push(...unknownFieldDiagnostics(parsed, sourceRef, QUALITY_MAP_SOURCE_REF_FIELDS, path));
    if (!isString(sourceRef.path) && !isString(sourceRef.url)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        path,
        "Each source ref must include at least path or url."
      );
    }
  });
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function pushEvidencePathWarning(
  parsed: ParsedQualityMap,
  diagnostics: QualityMapDiagnostic[],
  yamlPath: string,
  message: string,
  affectedEntityId?: string
): void {
  diagnostics.push(
    createQualityMapDiagnostic(parsed.source, {
      severity: "warning",
      code: "NON_CANONICAL_EVIDENCE_PATH",
      message,
      yamlPath,
      rawText: parsed.rawText,
      affectedEntityId
    })
  );
}

function validateEvidencePathFormat(
  parsed: ParsedQualityMap,
  diagnostics: QualityMapDiagnostic[],
  value: unknown,
  yamlPath: string,
  affectedEntityId?: string
): void {
  if (!isString(value)) {
    return;
  }

  const normalized = value.replaceAll("\\", "/");

  if (value.includes("\\")) {
    pushEvidencePathWarning(
      parsed,
      diagnostics,
      yamlPath,
      "Evidence path should use forward slashes and remain repo-relative.",
      affectedEntityId
    );
  }

  if (normalized.startsWith("./")) {
    pushEvidencePathWarning(
      parsed,
      diagnostics,
      yamlPath,
      "Evidence path should omit the leading './' and use a repo-relative path.",
      affectedEntityId
    );
  }

  if (normalized.startsWith("/") || isWindowsAbsolutePath(value)) {
    pushEvidencePathWarning(
      parsed,
      diagnostics,
      yamlPath,
      "Evidence path should be repo-relative, not absolute.",
      affectedEntityId
    );
  }

  if (normalized.startsWith("../") || normalized.includes("/../")) {
    pushEvidencePathWarning(
      parsed,
      diagnostics,
      yamlPath,
      "Evidence path should stay inside the repo root and must not use '..' traversal.",
      affectedEntityId
    );
  }
}

export function validateQualityMap(parsed: ParsedQualityMap): QualityMapValidationResult {
  if (parsed.status === "invalid" || parsed.rawDocument === undefined) {
    return {
      source: parsed.source,
      status: "invalid",
      rawText: parsed.rawText,
      invalidEntityIds: emptyInvalidEntities(),
      diagnostics: parsed.diagnostics
    };
  }

  const document = parsed.rawDocument;
  const diagnostics: QualityMapDiagnostic[] = [
    ...parsed.diagnostics,
    ...unknownFieldDiagnostics(parsed, document, QUALITY_MAP_TOP_LEVEL_FIELDS, "$")
  ];
  validateStructureProvenance(parsed, diagnostics, document.structure_provenance, "$.structure_provenance");
  let hasInvalidTarget = false;

  if (!isRecord(document.target)) {
    hasInvalidTarget = true;
    pushShapeDiagnostic(diagnostics, parsed, "$.target", "Quality map target must be an object.");
  } else {
    diagnostics.push(
      ...unknownFieldDiagnostics(parsed, document.target, QUALITY_MAP_TARGET_FIELDS, "$.target")
    );
    if (!isString(document.target.id)) {
      hasInvalidTarget = true;
      pushShapeDiagnostic(diagnostics, parsed, "$.target.id", "Quality map target.id is required.");
    }
    if (!isString(document.target.name)) {
      hasInvalidTarget = true;
      pushShapeDiagnostic(diagnostics, parsed, "$.target.name", "Quality map target.name is required.");
    }
    if (!isString(document.target.scope)) {
      hasInvalidTarget = true;
      pushShapeDiagnostic(diagnostics, parsed, "$.target.scope", "Quality map target.scope is required.");
    }
    validateSourceRefs(parsed, diagnostics, document.target.source_refs, "$.target.source_refs");
  }

  if (!Array.isArray(document.expectations)) {
    pushShapeDiagnostic(
      diagnostics,
      parsed,
      "$.expectations",
      "Quality map expectations must be an array."
    );
    return {
      source: parsed.source,
      status: "invalid",
      rawText: parsed.rawText,
      document,
      invalidEntityIds: emptyInvalidEntities(),
      diagnostics
    };
  }

  const invalidExpectationIds = new Set<string>();
  const invalidTaskIds = new Set<string>();
  const invalidEvidenceIds = new Set<string>();
  const duplicateExpectationIds = duplicateIds(document.expectations);
  const allTasks = document.expectations.flatMap((expectation) =>
    isRecord(expectation) && Array.isArray(expectation.tasks) ? expectation.tasks : []
  );
  const allEvidence = document.expectations.flatMap((expectation) =>
    isRecord(expectation) && Array.isArray(expectation.evidence) ? expectation.evidence : []
  );
  const duplicateTaskIds = duplicateIds(allTasks);
  const duplicateEvidenceIds = duplicateIds(allEvidence);

  function recordDuplicateIds(
    ids: ReadonlySet<string>,
    entityType: "expectation" | "task" | "evidence",
    invalidIds: Set<string>
  ): void {
    for (const id of ids) {
      invalidIds.add(id);
      diagnostics.push(
        createQualityMapDiagnostic(parsed.source, {
          severity: "error",
          code: "DUPLICATE_ENTITY_ID",
          message: `Duplicate ${entityType} id '${id}' is omitted from the normalized graph.`,
          yamlPath: "$.expectations",
          rawText: parsed.rawText,
          affectedEntityId: id
        })
      );
    }
  }

  recordDuplicateIds(duplicateExpectationIds, "expectation", invalidExpectationIds);
  recordDuplicateIds(duplicateTaskIds, "task", invalidTaskIds);
  recordDuplicateIds(duplicateEvidenceIds, "evidence", invalidEvidenceIds);

  document.expectations.forEach((expectation: QualityMapExpectationInput, expectationIndex) => {
    const expectationPath = `$.expectations[${expectationIndex}]`;
    if (!isRecord(expectation)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        expectationPath,
        "Each expectation must be an object.",
        `expectation:${expectationIndex}`
      );
      invalidExpectationIds.add(`expectation:${expectationIndex}`);
      return;
    }

    diagnostics.push(
      ...unknownFieldDiagnostics(parsed, expectation, QUALITY_MAP_EXPECTATION_FIELDS, expectationPath)
    );

    if (!isString(expectation.id)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.id`,
        "Expectation id is required.",
        `expectation:${expectationIndex}`
      );
      invalidExpectationIds.add(`expectation:${expectationIndex}`);
    }

    const affectedId = isString(expectation.id) ? expectation.id : `expectation:${expectationIndex}`;

    if (!isString(expectation.title)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.title`,
        "Expectation title is required.",
        affectedId
      );
      invalidExpectationIds.add(affectedId);
    }

    if (!isString(expectation.source_type)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.source_type`,
        "Expectation source_type is required.",
        affectedId
      );
    }

    validateStructureProvenance(
      parsed,
      diagnostics,
      expectation.structure_provenance,
      `${expectationPath}.structure_provenance`
    );

    if (!isString(expectation.category)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.category`,
        "Expectation category is required.",
        affectedId
      );
    }

    if (!isString(expectation.priority)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.priority`,
        "Expectation priority is required.",
        affectedId
      );
    }

    validateSourceRefs(parsed, diagnostics, expectation.source_refs, `${expectationPath}.source_refs`);

    if (expectation.tasks !== undefined && !Array.isArray(expectation.tasks)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.tasks`,
        "Expectation tasks must be an array.",
        affectedId
      );
    }

    if (
      expectation.accepted_gaps !== undefined &&
      (!Array.isArray(expectation.accepted_gaps) ||
        expectation.accepted_gaps.some((entry) => typeof entry !== "string"))
    ) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.accepted_gaps`,
        "Expectation accepted_gaps must be an array of gap-category strings.",
        affectedId
      );
    }

    if (Array.isArray(expectation.tasks)) {
      expectation.tasks.forEach((task, taskIndex) => {
        const taskPath = `${expectationPath}.tasks[${taskIndex}]`;
        if (!isRecord(task)) {
          pushShapeDiagnostic(
            diagnostics,
            parsed,
            taskPath,
            "Each task must be an object.",
            `${affectedId}:task:${taskIndex}`
          );
          invalidTaskIds.add(`${affectedId}:task:${taskIndex}`);
          return;
        }
        diagnostics.push(...unknownFieldDiagnostics(parsed, task, QUALITY_MAP_TASK_FIELDS, taskPath));
        if (!isString(task.id)) {
          pushShapeDiagnostic(
            diagnostics,
            parsed,
            `${taskPath}.id`,
            "Task id is required.",
            `${affectedId}:task:${taskIndex}`
          );
          invalidTaskIds.add(`${affectedId}:task:${taskIndex}`);
        }
      });
    }

    if (expectation.policy_override !== undefined && !isRecord(expectation.policy_override)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.policy_override`,
        "Expectation policy_override must be an object.",
        affectedId
      );
    }

    if (isRecord(expectation.policy_override)) {
      diagnostics.push(
        ...unknownFieldDiagnostics(
          parsed,
          expectation.policy_override,
          QUALITY_MAP_POLICY_OVERRIDE_FIELDS,
          `${expectationPath}.policy_override`
        )
      );
    }

    if (expectation.evidence !== undefined && !Array.isArray(expectation.evidence)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.evidence`,
        "Expectation evidence must be an array.",
        affectedId
      );
    }

    if (Array.isArray(expectation.evidence)) {
      expectation.evidence.forEach((evidence, evidenceIndex) => {
        const evidencePath = `${expectationPath}.evidence[${evidenceIndex}]`;
        if (!isRecord(evidence)) {
          pushShapeDiagnostic(
            diagnostics,
            parsed,
            evidencePath,
            "Each evidence entry must be an object.",
            `${affectedId}:evidence:${evidenceIndex}`
          );
          invalidEvidenceIds.add(`${affectedId}:evidence:${evidenceIndex}`);
          return;
        }
        diagnostics.push(
          ...unknownFieldDiagnostics(parsed, evidence, QUALITY_MAP_EVIDENCE_FIELDS, evidencePath)
        );
        if (!isString(evidence.id)) {
          pushShapeDiagnostic(
            diagnostics,
            parsed,
            `${evidencePath}.id`,
            "Evidence id is required.",
            `${affectedId}:evidence:${evidenceIndex}`
          );
          invalidEvidenceIds.add(`${affectedId}:evidence:${evidenceIndex}`);
        }
        if (!isString(evidence.type)) {
          pushShapeDiagnostic(
            diagnostics,
            parsed,
            `${evidencePath}.type`,
            "Evidence type is required.",
            typeof evidence.id === "string" ? evidence.id : undefined
          );
        }
        validateEvidencePathFormat(
          parsed,
          diagnostics,
          evidence.path,
          `${evidencePath}.path`,
          typeof evidence.id === "string" ? evidence.id : undefined
        );
        if (evidence.contexts !== undefined && !Array.isArray(evidence.contexts)) {
          pushShapeDiagnostic(
            diagnostics,
            parsed,
            `${evidencePath}.contexts`,
            "Evidence contexts must be an array.",
            typeof evidence.id === "string" ? evidence.id : undefined
          );
        }
      });
    }

    if (expectation.proof_gap !== undefined && !isRecord(expectation.proof_gap)) {
      pushShapeDiagnostic(
        diagnostics,
        parsed,
        `${expectationPath}.proof_gap`,
        "Expectation proof_gap must be an object.",
        affectedId
      );
    }

    if (isRecord(expectation.proof_gap)) {
      diagnostics.push(
        ...unknownFieldDiagnostics(
          parsed,
          expectation.proof_gap,
          QUALITY_MAP_PROOF_GAP_FIELDS,
          `${expectationPath}.proof_gap`
        )
      );
      if (!isString(expectation.proof_gap.summary)) {
        pushShapeDiagnostic(
          diagnostics,
          parsed,
          `${expectationPath}.proof_gap.summary`,
          "Expectation proof_gap.summary is required when proof_gap is present.",
          affectedId
        );
      }
    }
  });

  return {
    source: parsed.source,
    status: hasInvalidTarget ? "invalid" : graphStatusFromDiagnostics(diagnostics),
    rawText: parsed.rawText,
    document,
    invalidEntityIds: {
      expectations: [...invalidExpectationIds],
      tasks: [...invalidTaskIds],
      evidence: [...invalidEvidenceIds]
    },
    diagnostics
  };
}
