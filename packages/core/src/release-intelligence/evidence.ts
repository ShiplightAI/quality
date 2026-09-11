import type { ReleaseWorkflowEvidence } from './facts';
import type { CompiledBehavior, RepositoryFacts } from './facts';
import type { EvidenceContribution } from './types';

export interface CollectedEvidence {
  readonly key: string;
  readonly kind: string;
  readonly sourceName: string;
  readonly runtimeStatus: EvidenceContribution['runtimeStatus'];
  readonly identityStatus: EvidenceContribution['identityStatus'];
  readonly collectionStatus: EvidenceContribution['collectionStatus'];
  readonly providerRef?: string;
  readonly fileRef?: { readonly path: string };
  readonly details: Record<string, unknown>;
  readonly behaviorKeys: readonly string[];
  readonly relationship: EvidenceContribution['relationship'];
  readonly proves: readonly string[];
  readonly reason: string;
}
export function collectWorkflowEvidence(
  workflow: ReleaseWorkflowEvidence,
  facts: RepositoryFacts,
): readonly CollectedEvidence[] {
  const allBehaviors = facts.features.flatMap((feature) => feature.behaviors);
  const declared = allBehaviors.flatMap((behavior) =>
    behavior.evidenceDeclarations.map((item) => {
      const observations = facts.runtimeEvidence.filter(
        (evidence) => evidence.behaviorKey === behavior.key && evidence.evidenceKey === item.key,
      );
      return observations.length > 0
        ? observations.map(
            (observed): CollectedEvidence => ({
              key: observed.key,
              kind: observed.kind,
              sourceName: observed.sourceName,
              runtimeStatus: observed.runtimeStatus,
              identityStatus: observed.identityStatus,
              collectionStatus: observed.collectionStatus,
              providerRef: observed.providerRef,
              fileRef: observed.fileRef,
              details: {
                evidenceKey: observed.evidenceKey,
                workflowRunId: workflow.runId,
                ...(observed.testFile ? { testFile: observed.testFile } : {}),
                ...(observed.testCase ? { testCase: observed.testCase } : {}),
              },
              behaviorKeys: [observed.behaviorKey],
              relationship: 'direct',
              proves: observed.proves,
              reason: observed.reason,
            }),
          )
        : [missingDeclaration(behavior, item)];
    }),
  );
  const jobs = workflow.jobs.map(
    (job): CollectedEvidence => ({
      key: `job:${job.id}`,
      kind: 'workflow_job',
      sourceName: job.name,
      runtimeStatus: runtime(job.conclusion),
      identityStatus: 'matched',
      collectionStatus: 'available',
      providerRef: job.url,
      details: { status: job.status, conclusion: job.conclusion },
      behaviorKeys: [],
      relationship: 'indirect',
      proves: [],
      reason: 'Workflow operational evidence; no declared Behavior mapping was found.',
    }),
  );
  const artifacts = workflow.artifacts.map(
    (artifact): CollectedEvidence => ({
      key: `artifact:${artifact.id}`,
      kind: 'workflow_artifact',
      sourceName: artifact.name,
      runtimeStatus: artifact.expired ? 'unknown' : runtime(workflow.conclusion),
      identityStatus: 'matched',
      collectionStatus: artifact.expired ? 'expired' : 'available',
      providerRef: `artifact:${artifact.id}`,
      details: {
        artifactId: artifact.id,
        sizeInBytes: artifact.sizeInBytes,
        expired: artifact.expired,
      },
      behaviorKeys: [],
      relationship: 'indirect',
      proves: [],
      reason: artifact.expired
        ? 'GitHub reports this artifact as expired.'
        : 'Artifact is available but has no declared Behavior mapping.',
    }),
  );
  return [...declared.flat(), ...jobs, ...artifacts];
}

function missingDeclaration(
  behavior: CompiledBehavior,
  declaration: CompiledBehavior['evidenceDeclarations'][number],
): CollectedEvidence {
  return {
    // Declaration keys are scoped to a Behavior in repository facts. Include
    // both scopes so two Behaviors can safely reuse a conventional key such as
    // "e2e" without collapsing their persisted evidence records.
    key: `declared:${behavior.key}:${declaration.key}`,
    kind: declaration.kind,
    sourceName: declaration.sourceName,
    runtimeStatus: 'unknown',
    identityStatus: 'matched',
    collectionStatus: 'missing',
    ...(declaration.path ? { fileRef: { path: declaration.path } } : {}),
    details: { declaration },
    behaviorKeys: [behavior.key],
    relationship: 'indirect',
    proves: [],
    reason: 'No exact-run observation was available for this declared evidence.',
  };
}

function runtime(conclusion: string | null): EvidenceContribution['runtimeStatus'] {
  if (conclusion === 'success') return 'passed';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'cancelled')
    return 'failed';
  if (conclusion === 'skipped') return 'skipped';
  return 'unknown';
}
