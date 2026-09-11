import type {
  BehaviorAssessment,
  EvidenceContribution,
  ExpectedBehavior,
  RuntimeStatus,
} from './types';

function aggregateRuntime(evidence: readonly EvidenceContribution[]): RuntimeStatus {
  if (evidence.some((item) => item.runtimeStatus === 'failed')) return 'failed';
  if (evidence.some((item) => item.runtimeStatus === 'errored')) return 'errored';
  if (evidence.some((item) => item.runtimeStatus === 'passed')) return 'passed';
  if (evidence.some((item) => item.runtimeStatus === 'skipped')) return 'skipped';
  return 'unknown';
}
export function assessBehavior(
  behavior: ExpectedBehavior,
  evidence: readonly EvidenceContribution[],
): BehaviorAssessment {
  if (!behavior.applicable || behavior.reviewStatus === 'rejected') {
    return result(behavior, 'not_applicable', 'unknown', [], [], [], 'Behavior is not applicable.');
  }

  const admissible = evidence.filter(
    (item) => item.identityStatus === 'matched' && item.collectionStatus === 'available',
  );
  const runtimeStatus = aggregateRuntime(admissible);
  const evidenceIds = admissible.map((item) => item.id);

  if (runtimeStatus === 'failed') {
    return result(
      behavior,
      'failed',
      runtimeStatus,
      unique(admissible.flatMap((item) => item.proves)),
      [],
      evidenceIds,
      'Matching execution evidence observed the required behavior failing.',
    );
  }
  if (runtimeStatus === 'errored') {
    return result(
      behavior,
      'check_error',
      runtimeStatus,
      [],
      behavior.requiredProof,
      evidenceIds,
      'The check system errored before the required behavior could be assessed.',
    );
  }
  if (admissible.some((item) => item.relationship === 'conflicting')) {
    return result(
      behavior,
      'conflicting_facts',
      runtimeStatus,
      [],
      behavior.requiredProof,
      evidenceIds,
      'Admissible evidence contains conflicting facts.',
    );
  }

  const observed = unique(
    admissible
      .filter((item) => item.relationship === 'direct' || item.relationship === 'partial')
      .flatMap((item) => item.proves),
  );
  const missing = behavior.requiredProof.filter((facet) => !observed.includes(facet));
  if (missing.length > 0) {
    return result(
      behavior,
      'insufficient_proof',
      runtimeStatus,
      observed,
      missing,
      evidenceIds,
      admissible.length === 0
        ? 'No admissible evidence proves this behavior for the release commit.'
        : 'Available evidence does not prove every required outcome.',
    );
  }
  return result(
    behavior,
    'verified',
    runtimeStatus,
    observed,
    [],
    evidenceIds,
    'Every required proof facet is supported by admissible evidence.',
  );
}

function result(
  behavior: ExpectedBehavior,
  status: BehaviorAssessment['status'],
  runtimeStatus: RuntimeStatus,
  observedProof: readonly string[],
  missingProof: readonly string[],
  evidenceIds: readonly string[],
  reason: string,
): BehaviorAssessment {
  return {
    behaviorId: behavior.id,
    featureId: behavior.featureId,
    priority: behavior.priority,
    origin: behavior.origin,
    reviewStatus: behavior.reviewStatus,
    status,
    runtimeStatus,
    observedProof,
    missingProof,
    evidenceIds,
    reason,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
