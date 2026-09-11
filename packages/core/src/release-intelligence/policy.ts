import type {
  BehaviorAssessment,
  ReleaseException,
  ReleasePolicyDecision,
  ReleaseRuleResult,
  ReleaseSystemFact,
} from './types';
import { z } from 'zod';

export interface ReleasePolicy {
  readonly environment: 'staging' | 'production';
  readonly blockFailedPriorities: readonly BehaviorAssessment['priority'][];
  readonly blockInsufficientExplicitPriorities: readonly BehaviorAssessment['priority'][];
  readonly blockCheckErrors: boolean;
  readonly blockConflicts: boolean;
}
const ReleasePolicySchema = z
  .object({
    environment: z.enum(['staging', 'production']),
    blockFailedPriorities: z.array(z.enum(['P0', 'P1', 'P2', 'P3'])),
    blockInsufficientExplicitPriorities: z.array(z.enum(['P0', 'P1', 'P2', 'P3'])),
    blockCheckErrors: z.boolean(),
    blockConflicts: z.boolean(),
  })
  .strict();

export function parseReleasePolicy(value: unknown): ReleasePolicy {
  return ReleasePolicySchema.parse(value);
}

export function evaluateReleasePolicy(input: {
  readonly policy: ReleasePolicy;
  readonly assessments: readonly BehaviorAssessment[];
  readonly systemFacts?: readonly ReleaseSystemFact[];
  readonly exceptions?: readonly ReleaseException[];
  /** Evaluation time is an explicit fact so identical inputs always produce identical decisions. */
  readonly now: Date;
}): ReleasePolicyDecision {
  const excepted = new Set(
    (input.exceptions ?? [])
      .filter(
        (item) => item.revokedAt === null && item.expiresAt.getTime() > input.now.getTime(),
      )
      .map((item) => item.behaviorId),
  );
  const active = input.assessments.filter(
    (item) => item.status !== 'not_applicable' && item.reviewStatus !== 'rejected',
  );

  const failed = active.filter(
    (item) =>
      item.status === 'failed' && input.policy.blockFailedPriorities.includes(item.priority),
  );
  const insufficient = active.filter(
    (item) =>
      item.status === 'insufficient_proof' &&
      item.origin === 'explicit' &&
      item.reviewStatus === 'confirmed' &&
      input.policy.blockInsufficientExplicitPriorities.includes(item.priority),
  );
  const errors = input.policy.blockCheckErrors
    ? active.filter((item) => item.status === 'check_error')
    : [];
  const conflicts = input.policy.blockConflicts
    ? active.filter((item) => item.status === 'conflicting_facts')
    : [];

  const behaviorRules: ReleaseRuleResult[] = [
    rule('required-behavior-failed', failed, 'Required Behavior failures'),
    rule('required-proof-missing', insufficient, 'Required proof gaps'),
    rule('assessment-system-error', errors, 'Assessment system errors'),
    rule('conflicting-facts', conflicts, 'Conflicting product facts'),
  ].map((item) => applyExceptions(item, excepted));
  const systemRules: ReleaseRuleResult[] = (input.systemFacts ?? []).map((fact) => ({
    ruleKey: fact.key,
    status: fact.status === 'passed' ? 'pass' : fact.severity === 'critical' ? 'fail' : 'warn',
    effect: fact.status === 'passed' ? 'none' : fact.severity === 'critical' ? 'block' : 'warning',
    assessmentIds: [],
    exceptedAssessmentIds: [],
    systemFactKeys: [fact.key],
    reason: fact.summary,
  }));
  const rules = [...behaviorRules, ...systemRules];

  const blockingAssessmentIds = unique(
    rules.filter((item) => item.effect === 'block').flatMap((item) => item.assessmentIds),
  );
  const blockingSystemFactKeys = unique(
    rules.filter((item) => item.effect === 'block').flatMap((item) => item.systemFactKeys),
  );
  const explicitlyRuled = new Set(
    rules.flatMap((item) => [...item.assessmentIds, ...item.exceptedAssessmentIds]),
  );
  const warningAssessmentIds = unique([
    ...rules.filter((item) => item.effect === 'warning').flatMap((item) => item.assessmentIds),
    ...rules.flatMap((item) => item.exceptedAssessmentIds),
    ...active
      .filter((item) => !explicitlyRuled.has(item.behaviorId) && item.status !== 'verified')
      .map((item) => item.behaviorId),
  ]);

  return {
    decision: rules.some((item) => item.effect === 'block') ? 'BLOCK' : 'ALLOW',
    rules,
    blockingAssessmentIds,
    blockingSystemFactKeys,
    warningAssessmentIds,
  };
}

function rule(
  ruleKey: string,
  assessments: readonly BehaviorAssessment[],
  label: string,
): ReleaseRuleResult {
  const ids = assessments.map((item) => item.behaviorId);
  return {
    ruleKey,
    status: ids.length === 0 ? 'pass' : 'fail',
    effect: ids.length === 0 ? 'none' : 'block',
    assessmentIds: ids,
    exceptedAssessmentIds: [],
    systemFactKeys: [],
    reason: ids.length === 0 ? `${label}: none found.` : `${label}: ${ids.length} found.`,
  };
}

function applyExceptions(
  result: ReleaseRuleResult,
  exceptedBehaviorIds: ReadonlySet<string>,
): ReleaseRuleResult {
  if (result.effect !== 'block') return result;
  const remaining = result.assessmentIds.filter((id) => !exceptedBehaviorIds.has(id));
  const accepted = result.assessmentIds.filter((id) => exceptedBehaviorIds.has(id));
  if (accepted.length === 0) return result;
  // Keep waived inputs separate from unresolved inputs so both the decision
  // and its exception trail remain reconstructable from the stored result.
  return {
    ...result,
    status: remaining.length === 0 ? 'warn' : 'fail',
    effect: remaining.length === 0 ? 'warning' : 'block',
    assessmentIds: remaining,
    exceptedAssessmentIds: accepted,
    reason: `${result.reason} ${accepted.length} covered by active release exception.`,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
