import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCTION_POLICY, DEFAULT_STAGING_POLICY } from './default-rules';
import { evaluateReleasePolicy, parseReleasePolicy } from './policy';
import type { BehaviorAssessment } from './types';

function assessment(overrides: Partial<BehaviorAssessment> = {}): BehaviorAssessment {
  return {
    behaviorId: 'checkout',
    featureId: 'billing',
    priority: 'P0',
    origin: 'explicit',
    reviewStatus: 'confirmed',
    status: 'verified',
    runtimeStatus: 'passed',
    observedProof: [],
    missingProof: [],
    evidenceIds: [],
    reason: 'fixture',
    ...overrides,
  };
}

describe('evaluateReleasePolicy', () => {
  it('validates a frozen rule set before evaluation', () => {
    expect(parseReleasePolicy(DEFAULT_PRODUCTION_POLICY)).toEqual(DEFAULT_PRODUCTION_POLICY);
    expect(() =>
      parseReleasePolicy({ ...DEFAULT_PRODUCTION_POLICY, blockCheckErrors: 'yes' }),
    ).toThrow();
  });
  it('is deterministic and blocks a failed required Behavior', () => {
    const input = {
      policy: DEFAULT_PRODUCTION_POLICY,
      assessments: [assessment({ status: 'failed', runtimeStatus: 'failed' })],
      now: new Date(),
    };
    expect(evaluateReleasePolicy(input)).toEqual(evaluateReleasePolicy(input));
    expect(evaluateReleasePolicy(input).decision).toBe('BLOCK');
  });

  it('blocks a failed system fact without manufacturing a Behavior assessment', () => {
    const result = evaluateReleasePolicy({
      policy: DEFAULT_PRODUCTION_POLICY,
      assessments: [],
      systemFacts: [
        {
          key: 'repository-facts-complete',
          status: 'failed',
          severity: 'critical',
          summary: 'Repository facts are incomplete.',
          exceptionEligible: false,
          findings: [],
        },
      ],
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.blockingAssessmentIds).toEqual([]);
    expect(result.blockingSystemFactKeys).toEqual(['repository-facts-complete']);
    expect(result.rules).toContainEqual(
      expect.objectContaining({
        ruleKey: 'repository-facts-complete',
        effect: 'block',
        assessmentIds: [],
        systemFactKeys: ['repository-facts-complete'],
      }),
    );
  });

  it('does not turn a recommended proof gap into an undisclosed blocker', () => {
    const result = evaluateReleasePolicy({
      policy: DEFAULT_PRODUCTION_POLICY,
      assessments: [assessment({ origin: 'recommended', status: 'insufficient_proof' })],
    });
    expect(result.decision).toBe('ALLOW');
    expect(result.warningAssessmentIds).toEqual(['checkout']);
  });

  it('allows an active release exception without changing the assessment', () => {
    const failed = assessment({ status: 'failed', runtimeStatus: 'failed' });
    const now = new Date();
    const result = evaluateReleasePolicy({
      policy: DEFAULT_PRODUCTION_POLICY,
      assessments: [failed],
      exceptions: [
        {
          issueId: 'i1',
          behaviorId: failed.behaviorId,
          reason: 'Feature remains disabled',
          approvedByAccountId: 'a1',
          expiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
        },
      ],
      now,
    });
    expect(result.decision).toBe('ALLOW');
    expect(result.rules[0]?.effect).toBe('warning');
    expect(result.rules[0]?.assessmentIds).toEqual([]);
    expect(result.rules[0]?.exceptedAssessmentIds).toEqual(['checkout']);
    expect(result.warningAssessmentIds).toEqual(['checkout']);
    expect(failed.status).toBe('failed');
  });

  it('does not report an excepted Behavior as blocking when another Behavior still blocks', () => {
    const first = assessment({ behaviorId: 'first', status: 'failed', runtimeStatus: 'failed' });
    const second = assessment({ behaviorId: 'second', status: 'failed', runtimeStatus: 'failed' });
    const now = new Date();
    const result = evaluateReleasePolicy({
      policy: DEFAULT_PRODUCTION_POLICY,
      assessments: [first, second],
      exceptions: [
        {
          issueId: 'i1',
          behaviorId: 'first',
          reason: 'Scoped exception',
          approvedByAccountId: 'a1',
          expiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
        },
      ],
      now,
    });
    expect(result.decision).toBe('BLOCK');
    expect(result.blockingAssessmentIds).toEqual(['second']);
    expect(result.rules[0]?.assessmentIds).toEqual(['second']);
    expect(result.rules[0]?.exceptedAssessmentIds).toEqual(['first']);
  });

  it('blocks required explicit proof gaps according to environment priority', () => {
    const gap = assessment({
      priority: 'P1',
      status: 'insufficient_proof',
      runtimeStatus: 'unknown',
    });

    expect(
      evaluateReleasePolicy({ policy: DEFAULT_PRODUCTION_POLICY, assessments: [gap] }).decision,
    ).toBe('BLOCK');
    expect(
      evaluateReleasePolicy({ policy: DEFAULT_STAGING_POLICY, assessments: [gap] }).decision,
    ).toBe('ALLOW');
  });

  it.each(['check_error', 'conflicting_facts'] as const)(
    'blocks a %s assessment when the policy enables that gate',
    (status) => {
      const result = evaluateReleasePolicy({
        policy: DEFAULT_PRODUCTION_POLICY,
        assessments: [assessment({ status, runtimeStatus: 'errored' })],
      });

      expect(result.decision).toBe('BLOCK');
    },
  );

  it('does not apply an expired or revoked exception', () => {
    const now = new Date();
    const failed = assessment({ status: 'failed', runtimeStatus: 'failed' });
    const baseException = {
      issueId: 'i1',
      behaviorId: failed.behaviorId,
      reason: 'Scoped exception',
      approvedByAccountId: 'a1',
    };

    for (const exception of [
      { ...baseException, expiresAt: new Date(now.getTime() - 1), revokedAt: null },
      {
        ...baseException,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: new Date(now.getTime() - 1),
      },
    ]) {
      expect(
        evaluateReleasePolicy({
          policy: DEFAULT_PRODUCTION_POLICY,
          assessments: [failed],
          exceptions: [exception],
          now,
        }).decision,
      ).toBe('BLOCK');
    }
  });
});
