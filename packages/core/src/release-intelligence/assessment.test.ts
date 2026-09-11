import { describe, expect, it } from 'vitest';
import { assessBehavior } from './assessment';
import type { EvidenceContribution, ExpectedBehavior } from './types';

const behavior: ExpectedBehavior = {
  id: 'token-reuse',
  featureId: 'authentication',
  title: 'A password reset token cannot be reused',
  priority: 'P0',
  origin: 'explicit',
  reviewStatus: 'confirmed',
  sourceRefs: [],
  requiredProof: ['token rejected', 'password unchanged'],
  applicable: true,
};

function evidence(overrides: Partial<EvidenceContribution> = {}): EvidenceContribution {
  return {
    id: 'e1',
    runtimeStatus: 'passed',
    identityStatus: 'matched',
    collectionStatus: 'available',
    relationship: 'direct',
    proves: ['token rejected'],
    reason: 'API assertion',
    ...overrides,
  };
}

describe('assessBehavior', () => {
  it('keeps a passing runtime separate from insufficient proof', () => {
    const result = assessBehavior(behavior, [evidence()]);
    expect(result.runtimeStatus).toBe('passed');
    expect(result.status).toBe('insufficient_proof');
    expect(result.missingProof).toEqual(['password unchanged']);
  });

  it('marks a failed matching execution as failed rather than missing proof', () => {
    const result = assessBehavior(behavior, [evidence({ runtimeStatus: 'failed' })]);
    expect(result.status).toBe('failed');
    expect(result.runtimeStatus).toBe('failed');
  });

  it('ignores mismatched evidence when proving the release commit', () => {
    const result = assessBehavior(behavior, [
      evidence({ identityStatus: 'mismatched', proves: behavior.requiredProof }),
    ]);
    expect(result.status).toBe('insufficient_proof');
    expect(result.evidenceIds).toEqual([]);
  });

  it('combines multiple admissible records to verify all proof facets', () => {
    const result = assessBehavior(behavior, [
      evidence(),
      evidence({ id: 'e2', proves: ['password unchanged'], reason: 'Database assertion' }),
    ]);
    expect(result.status).toBe('verified');
    expect(result.missingProof).toEqual([]);
  });

  it('does not assess an inapplicable or rejected behavior', () => {
    const result = assessBehavior({ ...behavior, applicable: false }, [evidence()]);
    expect(result.status).toBe('not_applicable');
    expect(result.missingProof).toEqual([]);
    expect(assessBehavior({ ...behavior, reviewStatus: 'rejected' }, [evidence()]).status).toBe(
      'not_applicable',
    );
  });

  it('keeps conflicting facts distinct from an observed runtime failure', () => {
    const result = assessBehavior(behavior, [
      evidence({ relationship: 'conflicting', proves: behavior.requiredProof }),
    ]);

    expect(result.status).toBe('conflicting_facts');
    expect(result.runtimeStatus).toBe('passed');
  });

  it('reports an execution-system error as a check error', () => {
    const result = assessBehavior(behavior, [evidence({ runtimeStatus: 'errored' })]);

    expect(result.status).toBe('check_error');
    expect(result.runtimeStatus).toBe('errored');
  });

  it('does not mask an execution-system error as conflicting facts', () => {
    const result = assessBehavior(behavior, [
      evidence({ runtimeStatus: 'errored', relationship: 'conflicting' }),
    ]);

    expect(result.status).toBe('check_error');
    expect(result.runtimeStatus).toBe('errored');
  });
});
