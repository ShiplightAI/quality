import { describe, expect, it } from 'vitest';
import { buildReleaseIssueFixPrompt, buildReleaseIssueFixPromptForView } from './fix-prompt';

const issue = {
  kind: 'insufficient_proof',
  title: 'Checkout rejects expired cards: insufficient proof',
  reason: 'The workflow did not provide evidence for the declined-card response.',
  recommendedAction: 'Add or restore exact-commit runtime evidence.',
};

describe('buildReleaseIssueFixPrompt', () => {
  it('gives an AI the release, behavior, source, and proof context needed to fix an issue', () => {
    const prompt = buildReleaseIssueFixPrompt({
      repository: 'shiplight/example',
      commitSha: 'abc123def456',
      issue,
      behavior: {
        featureName: 'Checkout',
        title: 'Checkout rejects expired cards',
        description: 'An expired card is rejected without creating an order.',
        sourceRefs: [{ path: 'specs/checkout.md', startLine: 12, endLine: 18 }],
        missingProof: ['declined response', 'no order created'],
      },
    });

    expect(prompt).toContain(
      'Add the missing verification evidence: Checkout rejects expired cards',
    );
    expect(prompt).toContain('Context: Checkout / Checkout rejects expired cards');
    expect(prompt).toContain('Files: specs/checkout.md:12-18');
    expect(prompt).toContain('Missing proof: declined response, no order created');
    expect(prompt).toContain('Analyzed at: shiplight/example@abc123def456');
    expect(prompt).not.toContain('Workflow:');
    expect(prompt).not.toContain('Severity:');
    expect(prompt).toContain(
      'Do not change product behavior unless reproduction shows it is wrong.',
    );
  });

  it('includes every System Fact finding and affected path in an analysis-input prompt', () => {
    const prompt = buildReleaseIssueFixPrompt({
      repository: 'shiplight/example',
      commitSha: 'abc123def456',
      issue: { ...issue, kind: 'analysis_error' },
      systemFact: {
        findings: [
          {
            code: 'MISSING_EVIDENCE_FILE',
            message: 'A declared evidence file does not exist.',
            remediation: 'Restore the file or update the declaration.',
            declarationPath: 'quality-map.yaml',
            affectedPath: 'tests/checkout.yaml',
          },
        ],
      },
    });

    expect(prompt).toContain('Detail: A declared evidence file does not exist.');
    expect(prompt).toContain('Files: quality-map.yaml, tests/checkout.yaml');
    expect(prompt).toContain('Fix: Restore the file or update the declaration.');
    expect(prompt).toContain('Repair the release-analysis input:');
    expect(prompt).not.toContain('MISSING_EVIDENCE_FILE');
  });

  it('tells an AI to fix product code only for an observed behavior failure', () => {
    const prompt = buildReleaseIssueFixPrompt({
      repository: 'shiplight/example',
      commitSha: 'abc123def456',
      issue: { ...issue, kind: 'failed' },
    });

    expect(prompt).toContain('Fix the failing product behavior:');
    expect(prompt).toContain('make the smallest correct product fix');
    expect(prompt).not.toContain('Add the missing verification evidence:');
  });

  it.each([
    [
      'conflicting_facts',
      'Resolve the conflicting implementation or evidence:',
      'resolve the conflict without discarding valid evidence',
    ],
    [
      'check_error',
      'Repair the verification check:',
      'repair the check without weakening its assertions',
    ],
    [
      'new_issue_kind',
      'Address this release issue:',
      'make the smallest correct fix without weakening assertions',
    ],
  ])(
    'gives %s issues an accurate task and verification instruction',
    (kind, task, verification) => {
      const prompt = buildReleaseIssueFixPrompt({
        repository: 'shiplight/example',
        commitSha: 'abc123def456',
        issue: { ...issue, kind },
      });

      expect(prompt).toContain(task);
      expect(prompt).toContain(verification);
    },
  );
});

describe('buildReleaseIssueFixPromptForView', () => {
  it('joins a persisted issue to its behavior without platform record types', () => {
    const prompt = buildReleaseIssueFixPromptForView(
      {
        repository: 'shiplight/example',
        release: { commitSha: 'a'.repeat(40) },
        features: [
          {
            id: 'feature-1',
            featureKey: 'checkout',
            name: 'Checkout',
            description: '',
            priority: 'P0',
            status: 'confirmed',
            sourceRefs: [],
            diagnostics: [],
          },
        ],
        behaviors: [
          {
            featureId: 'feature-1',
            behavior: {
              id: 'behavior-1',
              behaviorKey: 'checkout:succeeds',
              title: 'Checkout succeeds',
              description: null,
              priority: 'P0',
              origin: 'explicit',
              reviewStatus: 'confirmed',
              sourceRefs: [{ path: 'specs/checkout.md', startLine: 12 }],
              requiredProof: ['checkout succeeds'],
              applicable: true,
            },
          },
        ],
        assessments: [
          {
            id: 'assessment-1',
            behaviorSnapshotId: 'behavior-1',
            status: 'insufficient_proof',
            runtimeStatus: 'unknown',
            observedProof: [],
            missingProof: ['checkout succeeds'],
            reason: 'No evidence.',
          },
        ],
        issues: [],
        assessmentEvidence: [],
        systemFacts: [],
        evidence: [],
        rules: [],
      },
      { ...issue, id: 'issue-1', assessmentId: 'assessment-1', systemFactId: null, severity: 'critical', blocksWithoutException: true },
    );

    expect(prompt).toContain('Context: Checkout / Checkout succeeds');
    expect(prompt).toContain('Files: specs/checkout.md:12');
  });
});
