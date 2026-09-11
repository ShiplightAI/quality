import { describe, expect, it } from 'vitest';
import { collectWorkflowEvidence } from './evidence';
import type { ReleaseWorkflowEvidence } from './facts';
import type { CompiledFeature, RepositoryFacts } from './facts';

const workflow: ReleaseWorkflowEvidence = {
  runId: '42',
  conclusion: 'success',
  jobs: [
    {
      id: 1,
      name: 'checkout contract suite',
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/job/1',
    },
  ],
  artifacts: [{ id: 2, name: 'playwright-report', sizeInBytes: 1, expired: true }],
};

const features: CompiledFeature[] = [
  {
    key: 'checkout',
    name: 'Checkout',
    description: '',
    priority: 'P0',
    status: 'confirmed',
    sourceRefs: [],
    diagnostics: [],
    behaviors: [
      {
        key: 'checkout-success',
        title: 'Checkout succeeds',
        priority: 'P0',
        origin: 'explicit',
        reviewStatus: 'confirmed',
        sourceRefs: [],
        requiredProof: ['Checkout succeeds is satisfied at runtime'],
        evidenceDeclarations: [
          { key: 'contract', kind: 'contract', sourceName: 'checkout contract' },
          { key: 'unseen', kind: 'e2e', sourceName: 'unseen e2e' },
        ],
      },
    ],
  },
];

const facts: RepositoryFacts = {
  features,
  runtimeEvidence: [
    {
      key: 'observation:release:contract:1',
      evidenceKey: 'contract',
      behaviorKey: 'checkout-success',
      kind: 'contract',
      sourceName: 'checkout contract',
      runtimeStatus: 'passed',
      identityStatus: 'matched',
      collectionStatus: 'available',
      providerRef: 'https://github.com/job/1',
      testFile: 'tests/checkout.spec.ts',
      testCase: 'customer completes checkout',
      proves: ['Checkout succeeds is satisfied at runtime'],
      reason: 'Exact-run observation passed.',
    },
  ],
  diagnostics: [],
  integrityDiagnostics: [],
  factIntegrity: 'complete',
  factSet: {},
};

describe('collectWorkflowEvidence', () => {
  it('only gives direct proof to a declared input that matches the workflow', () => {
    const evidence = collectWorkflowEvidence(workflow, facts);
    expect(evidence.find((item) => item.key === 'observation:release:contract:1')).toMatchObject({
      runtimeStatus: 'passed',
      collectionStatus: 'available',
      relationship: 'direct',
      behaviorKeys: ['checkout-success'],
      details: {
        evidenceKey: 'contract',
        workflowRunId: '42',
        testFile: 'tests/checkout.spec.ts',
        testCase: 'customer completes checkout',
      },
    });
    expect(evidence.find((item) => item.key === 'declared:checkout-success:unseen')).toMatchObject({
      runtimeStatus: 'unknown',
      collectionStatus: 'missing',
      relationship: 'indirect',
      proves: [],
    });
  });

  it('keeps missing declarations distinct when behaviors reuse a declaration key', () => {
    const repeated = {
      ...facts,
      features: [
        {
          ...features[0]!,
          behaviors: [
            features[0]!.behaviors[0]!,
            {
              ...features[0]!.behaviors[0]!,
              key: 'checkout-refund',
              title: 'Checkout can be refunded',
              evidenceDeclarations: [
                { key: 'unseen', kind: 'e2e', sourceName: 'unseen refund e2e' },
              ],
            },
          ],
        },
      ],
    } satisfies RepositoryFacts;

    const missing = collectWorkflowEvidence(workflow, repeated).filter(
      (item) => item.collectionStatus === 'missing',
    );
    expect(missing.map((item) => item.key)).toEqual([
      'declared:checkout-success:unseen',
      'declared:checkout-refund:unseen',
    ]);
  });

  it('keeps expired artifacts visible without treating them as proof', () => {
    expect(
      collectWorkflowEvidence(workflow, facts).find((item) => item.key === 'artifact:2'),
    ).toMatchObject({
      collectionStatus: 'expired',
      runtimeStatus: 'unknown',
      behaviorKeys: [],
      providerRef: 'artifact:2',
    });
  });
});
