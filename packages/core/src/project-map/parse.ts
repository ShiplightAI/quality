import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import type {
  ParsedProjectMap,
  ParsedProjectMapDocument,
  ProjectMapDiagnostic,
  ProjectMapFeature,
  ProjectMapFeatureArtifacts,
  ProjectMapParseBatch,
  ProjectMapSource,
  ProjectMapSourceReference
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function diagnostic(
  source: ProjectMapSource,
  input: {
    readonly severity: ProjectMapDiagnostic["severity"];
    readonly code: string;
    readonly message: string;
    readonly yamlPath?: string;
  }
): ProjectMapDiagnostic {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    mapPath: source.projectRelativePath,
    yamlPath: input.yamlPath ?? "$"
  };
}

function sourceRefs(value: unknown): readonly ProjectMapSourceReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const reference = {
      path: stringValue(item.path),
      url: stringValue(item.url),
      label: stringValue(item.label),
      anchor: stringValue(item.anchor)
    };

    return reference.path === undefined && reference.url === undefined && reference.label === undefined
      ? []
      : [reference];
  });
}

function artifactsFrom(value: unknown): ProjectMapFeatureArtifacts {
  if (!isRecord(value)) {
    return {
      checklistPaths: []
    };
  }

  return {
    specPath: stringValue(value.spec_path),
    planPath: stringValue(value.plan_path),
    tasksPath: stringValue(value.tasks_path),
    qualityMapPath: stringValue(value.quality_map_path),
    testReportPath: stringValue(value.test_report_path),
    checklistPaths: stringArray(value.checklist_paths)
  };
}

function featureFrom(value: unknown): ProjectMapFeature | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = stringValue(value.id);
  if (id === undefined) {
    return undefined;
  }

  return {
    id,
    name: stringValue(value.name) ?? id,
    description: stringValue(value.description),
    status: stringValue(value.status) ?? "unknown",
    priority: stringValue(value.priority),
    priorityProvenance: stringValue(value.priority_provenance) === "human" ? "human" : "agent",
    sourceType: stringValue(value.source_type),
    dependencies: stringArray(value.dependencies),
    artifacts: artifactsFrom(value.artifacts),
    codeRefs: stringArray(value.code_refs),
    evidenceRefs: stringArray(value.evidence_refs),
    openQuestions: stringArray(value.open_questions),
    residualRisks: stringArray(value.residual_risks)
  };
}

function projectFrom(value: Record<string, unknown>): ParsedProjectMapDocument["project"] {
  const project = isRecord(value.project) ? value.project : {};
  const id = stringValue(project.id) ?? "project";

  return {
    id,
    name: stringValue(project.name) ?? id,
    summary: stringValue(project.summary),
    qualityPolicyPath: stringValue(project.quality_policy_path),
    sourceRefs: sourceRefs(project.source_refs)
  };
}

function activeFeatureFrom(value: unknown): ParsedProjectMapDocument["activeFeature"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = stringValue(value.id);
  if (id === undefined) {
    return undefined;
  }

  return {
    id,
    branch: stringValue(value.branch),
    specPath: stringValue(value.spec_path),
    phase: stringValue(value.phase),
    updatedAt: stringValue(value.updated_at)
  };
}

// Display order for the project index. Top-level, not under a `roadmap:` block:
// the quality graph models features, checks, and proof, and leaves roadmap,
// milestone, and release grouping to the planning documents in `product_docs`.
function featureOrderFrom(value: Record<string, unknown>): readonly string[] {
  return stringArray(value.feature_order);
}

function productDocsFrom(value: unknown): readonly ProjectMapSourceReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const path = stringValue(item.path);
    if (path === undefined) {
      return [];
    }

    return [{
      path,
      label: stringValue(item.role) ?? stringValue(item.id) ?? "Project document"
    }];
  });
}

function concernsFrom(value: unknown): ParsedProjectMapDocument["crossFeatureConcerns"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = stringValue(item.id);
    if (id === undefined) {
      return [];
    }

    return [{
      id,
      title: stringValue(item.title) ?? id,
      description: stringValue(item.description) ?? stringValue(item.notes),
      status: stringValue(item.status) ?? "unknown",
      featureIds: stringArray(item.feature_ids),
      sourceRefs: sourceRefs(item.source_refs),
      notes: stringValue(item.notes)
    }];
  });
}

function discoveryFrom(value: unknown): ParsedProjectMapDocument["discovery"] {
  if (!isRecord(value)) {
    return {
      evidenceGaps: [],
      unresolvedDrift: []
    };
  }

  return {
    mode: stringValue(value.mode),
    evidenceGaps: stringArray(value.evidence_gaps),
    unresolvedDrift: stringArray(value.unresolved_drift)
  };
}

function normalizeProjectMap(value: Record<string, unknown>): ParsedProjectMapDocument {
  return {
    project: projectFrom(value),
    activeFeature: activeFeatureFrom(value.active_feature),
    featureOrder: featureOrderFrom(value),
    features: Array.isArray(value.features)
      ? value.features.flatMap((item) => {
          const feature = featureFrom(item);
          return feature === undefined ? [] : [feature];
        })
      : [],
    productDocs: productDocsFrom(value.product_docs),
    crossFeatureConcerns: concernsFrom(value.cross_feature_concerns),
    discovery: discoveryFrom(value.discovery)
  };
}

export function parseProjectMap(source: ProjectMapSource): ParsedProjectMap {
  let rawText = "";

  try {
    rawText = readFileSync(source.resolvedLocalPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read project structure file.";
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: [
        diagnostic(source, {
          severity: "error",
          code: "UNREADABLE_PROJECT_MAP",
          message
        })
      ]
    };
  }

  const document = parseDocument(rawText, { prettyErrors: false });
  if (document.errors.length > 0) {
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: document.errors.map((error) =>
        diagnostic(source, {
          severity: "error",
          code: "INVALID_PROJECT_MAP_YAML",
          message: error.message
        })
      )
    };
  }

  const value = document.toJSON() as unknown;
  if (!isRecord(value)) {
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: [
        diagnostic(source, {
          severity: "error",
          code: "EMPTY_OR_NON_OBJECT_PROJECT_MAP",
          message: "Project structure file must contain a YAML object."
        })
      ]
    };
  }

  const map = normalizeProjectMap(value);
  if (map.features.length === 0 && map.project.sourceRefs.length === 0) {
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: [
        diagnostic(source, {
          severity: "error",
          code: "PROJECT_MAP_HAS_NO_ENTRIES",
          message: "Project structure file must include project source references or at least one feature."
        })
      ]
    };
  }

  // Warn on duplicate feature ids: normalize/merge keep only the last, so a
  // silent duplicate would discard a feature without any signal.
  const featureIds = map.features.map((feature) => feature.id);
  const duplicateFeatureIds = [...new Set(featureIds.filter((id, index) => featureIds.indexOf(id) !== index))];
  const diagnostics = duplicateFeatureIds.map((id) =>
    diagnostic(source, {
      severity: "warning",
      code: "DUPLICATE_FEATURE_ID",
      message: `Feature id ${id} is defined more than once; only the last is kept.`
    })
  );

  // A `roadmap:` block is no longer read. Its `feature_order` moved to the top
  // level and its `current_milestone`/`release_areas` were removed outright, so
  // a map written against the old shape parses cleanly and silently loses its
  // index ordering. Say so rather than letting the list quietly reorder.
  if (isRecord(value.roadmap)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "warning",
        code: "LEGACY_ROADMAP_BLOCK",
        message:
          "`roadmap:` is no longer read. Move `roadmap.feature_order` to the top level as `feature_order`; milestone and release grouping belong in the documents listed under `product_docs`.",
        yamlPath: "$.roadmap"
      })
    );
  }

  return {
    source,
    status: "parsed",
    rawText,
    map,
    diagnostics
  };
}

function projectMapRank(result: ParsedProjectMap): number {
  if (result.source.projectRelativePath === ".quality/project-map.yaml") {
    return 0;
  }

  return 1;
}

export function parseProjectMaps(sources: readonly ProjectMapSource[]): ProjectMapParseBatch {
  const results = sources.map(parseProjectMap);
  const parsed = results.filter((result) => result.status === "parsed" && result.map !== undefined);
  const primary = parsed.toSorted((left, right) => projectMapRank(left) - projectMapRank(right))[0];
  const diagnostics = [...results.flatMap((result) => result.diagnostics)];

  if (parsed.length > 1 && primary !== undefined) {
    diagnostics.push(
      diagnostic(primary.source, {
        severity: "info",
        code: "MULTIPLE_PROJECT_MAPS_FOUND",
        message: `Multiple project structure files were found; ${primary.source.projectRelativePath} is the entry point.`
      })
    );
  }

  return {
    results,
    primary,
    diagnostics
  };
}
