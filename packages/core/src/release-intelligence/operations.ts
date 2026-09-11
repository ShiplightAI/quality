import { executeObservationSourceOp, scanOp } from "../operations";
import { resolveSavedQcViews } from "../views";
import { resolveReleaseComponentFeatureIds } from "./components";
import type {
  CompiledBehavior,
  CompiledFeature,
  RepositoryFacts,
  RuntimeFactEvidence,
} from "./facts";
import type { BehaviorPriority, SourceReference } from "./types";

export interface CompileReleaseFactsInput {
  /**
   * A server-owned checkout pinned to commitSha. Hosts must not pass an
   * untrusted client-supplied filesystem path.
   */
  readonly projectPath: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly workflowRunId: string;
  readonly analyzedWorkflowPath: string;
  readonly components: readonly string[];
  /**
   * Least-privilege environment for observation transports. A hosted adapter
   * should inject only the credential required by the selected transport.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Values removed recursively from persisted diagnostics. */
  readonly diagnosticSecrets?: readonly string[];
}

/**
 * Compile release facts from an already-authorized, immutable checkout.
 * Repository materialization, tenant authorization, and persistence belong to
 * the embedding host.
 */
export async function compileReleaseFactsOp(
  input: CompileReleaseFactsInput,
): Promise<RepositoryFacts> {
  if (!/^[0-9a-f]{40}$/i.test(input.commitSha)) {
    throw new Error("A full 40-character commit SHA is required.");
  }
  if (!parseRepoFullName(input.repository)) {
    throw new Error("Invalid repository name.");
  }
  const root = input.projectPath;
    const scan = await scanOp({ projectPath: root, mode: 'scan' });
    const projectFeatures = scan.result.projectMaps.primary?.map?.features ?? [];
    const componentFeatureIds = resolveReleaseComponentFeatureIds(
      resolveSavedQcViews(scan.result),
      input.components,
      projectFeatures.map((feature) => feature.id),
    );
    const selectedProjectFeatures = projectFeatures.filter((feature) =>
      componentFeatureIds.has(feature.id),
    );
    const selectedQualityMapPaths = new Set(
      selectedProjectFeatures.flatMap((feature) =>
        feature.artifacts.qualityMapPath ? [feature.artifacts.qualityMapPath] : [],
      ),
    );
    const selectedQualityMaps = scan.result.qualityMaps.results.filter((result) =>
      selectedQualityMapPaths.has(result.source.projectRelativePath),
    );
    const discoveredQualityMapPaths = new Set(
      selectedQualityMaps.map((result) => result.source.projectRelativePath),
    );
    const features: CompiledFeature[] = [];
    for (const result of selectedQualityMaps) {
      if (!result.graph) continue;
      const graph = result.graph;
      const mapRef: SourceReference = {
        path: graph.source.projectRelativePath,
        label: 'Quality map',
      };
      const behaviors = graph.expectations.map((expectation): CompiledBehavior => {
        const rawExpectation = result.document?.expectations?.find(
          (item) => item.id === expectation.localId,
        );
        const expectationRefs = (rawExpectation?.source_refs ?? []).flatMap((item) =>
          typeof item.path === 'string'
            ? [
                {
                  path: item.path,
                  ...(typeof item.label === 'string' ? { label: item.label } : {}),
                },
              ]
            : [],
        );
        const declarations = graph.evidence
          .filter((item) => item.expectationId === expectation.normalizedId)
          .map((item) => ({
            key: item.normalizedId,
            kind: item.type,
            sourceName: item.testCase ?? item.path ?? item.command ?? item.localId,
            ...(item.path ? { path: item.path } : {}),
            ...(item.url ? { url: item.url } : {}),
            ...(item.command ? { command: item.command } : {}),
          }));
        const explicit = expectation.sourceType === 'SOURCE';
        const reviewed = graph.checksReviewed;
        return {
          key: expectation.normalizedId,
          title: expectation.title,
          ...(expectation.description ? { description: expectation.description } : {}),
          priority: normalizePriority(expectation.priority),
          origin: explicit
            ? 'explicit'
            : expectation.sourceType === 'INFERRED'
              ? 'recommended'
              : 'derived',
          reviewStatus: reviewed ? 'confirmed' : 'proposed',
          sourceRefs: expectationRefs.length > 0 ? expectationRefs : [mapRef],
          requiredProof: [`${expectation.title} is satisfied at runtime`],
          evidenceDeclarations: declarations,
        };
      });
      features.push({
        key: graph.target.normalizedId,
        name: graph.target.name,
        description: `Release expectations declared by ${graph.source.projectRelativePath}`,
        priority: highestPriority(behaviors.map((item) => item.priority)),
        status: graph.checksReviewed ? 'confirmed' : 'proposed',
        sourceRefs: [mapRef],
        diagnostics: result.diagnostics.map((item) => ({ ...item })),
        behaviors,
      });
    }
    const profiles = scan.result.observationSourceProfiles.results
      .flatMap((result) => (result.status === 'parsed' ? (result.document?.profiles ?? []) : []))
      .filter((profile) => profile.transport === 'github-actions');
    const runtimeEvidence: RuntimeFactEvidence[] = [];
    const runtimeDiagnostics: Record<string, unknown>[] = [];
    const eligibleProfiles = profiles.filter((profile) => {
      const declaredRepository = profile.github?.repo;
      if (
        typeof declaredRepository === 'string' &&
        observationProfileTargetsRepository(declaredRepository, input.repository)
      ) {
        return true;
      }
      runtimeDiagnostics.push({
        severity: 'warning',
        code: 'CROSS_REPOSITORY_OBSERVATION_SOURCE_SKIPPED',
        message: `Observation source profile ${profile.id} does not target the release repository and was skipped.`,
        profileId: profile.id,
      });
      return false;
    });
    const selectedBehaviorKeys = new Set(
      features.flatMap((feature) => feature.behaviors.map((behavior) => behavior.key)),
    );
    if (eligibleProfiles.length > 0) {
      const executions = await Promise.all(
        eligibleProfiles.map(async (profile) => ({
          profile,
          result: await executeObservationSourceOp({
            projectPath: root,
            profileId: profile.id,
            selection: observationSelectionForProfile({
              profileId: profile.id,
              profileWorkflow: profile.github?.workflow,
              analyzedWorkflowPath: input.analyzedWorkflowPath,
              workflowRunId: input.workflowRunId,
              commitSha: input.commitSha,
            }),
            env: input.env,
          }),
        })),
      );
      for (const { profile, result } of executions) {
        runtimeDiagnostics.push(
          ...redactDiagnosticSecrets(
            [
              ...result.execution.diagnostics.map((item) => ({ ...item, profileId: profile.id })),
              ...result.resolution.diagnostics.map((item) => ({ ...item, profileId: profile.id })),
            ],
            input.diagnosticSecrets ?? [],
          ),
        );
        for (const group of result.evaluations) {
          for (const target of group.targets) {
            for (const expectation of target.expectations) {
              if (!selectedBehaviorKeys.has(expectation.expectationId)) continue;
              for (const observed of expectation.evidence) {
                const resolvedObservation = observed.observationId
                  ? result.resolution.auditRows.find(
                      (item) =>
                        item.observationId === observed.observationId &&
                        item.evidenceId === observed.evidenceId,
                    )
                  : undefined;
                const declaration = features
                  .flatMap((feature) => feature.behaviors)
                  .flatMap((behavior) => behavior.evidenceDeclarations)
                  .find((item) => item.key === observed.evidenceId);
                const identityStatus =
                  observed.commit === input.commitSha
                    ? ('matched' as const)
                    : observed.commit
                      ? ('mismatched' as const)
                      : ('unverifiable' as const);
                const runtimeStatus = observationRuntime(observed.state);
                const available = Boolean(observed.observationId);
                runtimeEvidence.push({
                  key: `observation:${profile.id}:${observed.evidenceId}:${observed.observationId ?? 'missing'}`,
                  evidenceKey: observed.evidenceId,
                  behaviorKey: expectation.expectationId,
                  kind: declaration?.kind ?? 'observation',
                  sourceName: declaration?.sourceName ?? observed.evidenceLocalId,
                  runtimeStatus,
                  identityStatus,
                  collectionStatus: available ? 'available' : 'missing',
                  ...(observed.runUrl ? { providerRef: observed.runUrl } : {}),
                  ...(declaration?.path ? { fileRef: { path: declaration.path } } : {}),
                  ...(resolvedObservation?.testFile
                    ? { testFile: resolvedObservation.testFile }
                    : {}),
                  ...(resolvedObservation?.testCase
                    ? { testCase: resolvedObservation.testCase }
                    : {}),
                  proves:
                    available && runtimeStatus === 'passed' && identityStatus === 'matched'
                      ? [`${expectation.title} is satisfied at runtime`]
                      : [],
                  reason: !available
                    ? 'The declared observation was not present in the selected workflow run.'
                    : identityStatus !== 'matched'
                      ? 'The observation revision does not match the release commit.'
                      : `The exact-run observation reported ${observed.state}.`,
                });
              }
            }
          }
        }
      }
    }
    const repositoryDiagnostics = [
      ...scan.result.diagnostics.map((item) => ({ ...item })),
      ...diagnosticsForSelectedQualityMaps(selectedQualityMaps),
      ...selectedProjectFeatures
        .filter((feature) => !feature.artifacts.qualityMapPath)
        .map((feature) => ({
          severity: 'error',
          code: 'component_feature_quality_map_missing',
          message: `Component Feature ${feature.id} has no quality map.`,
        })),
      ...[...selectedQualityMapPaths]
        .filter((path) => !discoveredQualityMapPaths.has(path))
        .map((path) => ({
          severity: 'error',
          code: 'component_feature_quality_map_unavailable',
          message: `Component quality map ${path} could not be scanned.`,
        })),
    ];
    const factIntegrity =
      scan.result.status === 'completed' &&
      selectedProjectFeatures.every((feature) => Boolean(feature.artifacts.qualityMapPath)) &&
      selectedQualityMaps.length === selectedQualityMapPaths.size &&
      selectedQualityMaps.every(isUsableSelectedQualityMap)
        ? ('complete' as const)
        : ('incomplete' as const);
    const integrityDiagnostics =
      factIntegrity === 'incomplete'
        ? repositoryDiagnostics.filter((item) => item.severity !== 'info')
        : [];
    if (factIntegrity === 'incomplete' && integrityDiagnostics.length === 0) {
      integrityDiagnostics.push({
        severity: 'error',
        code: 'REPOSITORY_FACTS_INCOMPLETE',
        message: 'The repository fact compiler did not complete every selected input.',
      });
    }
    return {
      features,
      runtimeEvidence,
      diagnostics: [...repositoryDiagnostics, ...runtimeDiagnostics],
      integrityDiagnostics,
      factIntegrity,
      factSet: {
        scanStatus: scan.result.status,
        factIntegrity,
        components: [...input.components],
        artifactCount: scan.result.artifacts.length,
        qualityMapCount: features.length,
        observationCount: runtimeEvidence.filter((item) => item.collectionStatus === 'available')
          .length,
      },
    };

}

export function diagnosticsForSelectedQualityMaps(
  qualityMaps: readonly {
    readonly diagnostics: readonly object[];
  }[],
): Record<string, unknown>[] {
  return qualityMaps.flatMap((qualityMap) =>
    qualityMap.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  );
}

export function isUsableSelectedQualityMap(qualityMap: {
  readonly status: string;
  readonly graph?: unknown;
}): boolean {
  return (
    (qualityMap.status === 'valid' || qualityMap.status === 'partial') && Boolean(qualityMap.graph)
  );
}

export function observationProfileTargetsRepository(
  declaredRepository: string,
  releaseRepository: string,
): boolean {
  const declared = parseRepoFullName(declaredRepository);
  const release = parseRepoFullName(releaseRepository);
  return (
    declared !== null &&
    release !== null &&
    declared.owner.toLowerCase() === release.owner.toLowerCase() &&
    declared.name.toLowerCase() === release.name.toLowerCase()
  );
}

export function observationSelectionForProfile(input: {
  profileId: string;
  profileWorkflow?: string;
  analyzedWorkflowPath: string;
  workflowRunId: string;
  commitSha: string;
}) {
  const selection = { commit: input.commitSha };
  if (
    !input.profileWorkflow ||
    workflowFileName(input.profileWorkflow) !== workflowFileName(input.analyzedWorkflowPath)
  ) {
    return selection;
  }
  return {
    ...selection,
    profiles: [
      {
        profileId: input.profileId,
        runId: Number(input.workflowRunId),
        commit: input.commitSha,
      },
    ],
  };
}

function workflowFileName(value: string): string {
  return value.split('@', 1)[0]?.split('/').at(-1) ?? value;
}
export function redactDiagnosticSecrets(
  diagnostics: readonly Record<string, unknown>[],
  secrets: readonly string[],
): Record<string, unknown>[] {
  const presentSecrets = secrets.filter((secret) => secret.length > 0);
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const explicit = presentSecrets.reduce(
        (result, secret) => result.replaceAll(secret, '[REDACTED]'),
        value,
      );
      return explicit.replace(
        /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        '[REDACTED]',
      );
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, redact(nested)]),
      );
    }
    return value;
  };
  return diagnostics.map((diagnostic) => redact(diagnostic) as Record<string, unknown>);
}

function observationRuntime(
  state: 'pass' | 'fail' | 'error' | 'skipped' | 'unobserved',
): RuntimeFactEvidence['runtimeStatus'] {
  if (state === 'pass') return 'passed';
  if (state === 'fail') return 'failed';
  if (state === 'error') return 'errored';
  if (state === 'skipped') return 'skipped';
  return 'unknown';
}

function normalizePriority(value?: string): BehaviorPriority {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3' ? value : 'P2';
}

function highestPriority(values: readonly BehaviorPriority[]): BehaviorPriority {
  for (const value of ['P0', 'P1', 'P2', 'P3'] as const) if (values.includes(value)) return value;
  return 'P2';
}


function parseRepoFullName(value: string): { readonly owner: string; readonly name: string } | null {
  const segments = value.split("/");
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  if (!owner || !name) return null;
  return { owner, name };
}
