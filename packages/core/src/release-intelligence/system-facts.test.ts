import { describe, expect, it } from 'vitest';
import {
  buildReleaseSystemFacts,
  parseReleaseSystemFactFindings,
  systemFactFindingPresentation,
} from './system-facts';

describe('parseReleaseSystemFactFindings', () => {
  it('accepts persisted findings and rejects malformed JSON as a whole', () => {
    const finding = {
      code: 'INVALID_YAML',
      message: 'Could not parse quality-map.yaml.',
      remediation: 'Fix the YAML syntax.',
      line: 3,
    };

    expect(parseReleaseSystemFactFindings([finding])).toEqual([finding]);
    expect(parseReleaseSystemFactFindings([{ ...finding, line: 0 }])).toEqual([]);
    expect(parseReleaseSystemFactFindings(null)).toEqual([]);
  });
});

describe('buildReleaseSystemFacts', () => {
  it('turns a missing evidence file into an actionable repository integrity finding', () => {
    const facts = buildReleaseSystemFacts({
      factIntegrity: 'incomplete',
      evidenceTruncated: false,
      integrityDiagnostics: [
        {
          severity: 'warning',
          code: 'MISSING_EVIDENCE_FILE',
          message:
            'Evidence path apps/cli/tests/integration/standalone-export.test.ts referenced by ev-standalone-export-logic does not exist in the scanned repo.',
          affectedPath: '.quality/evidence/002-shiplightai-cli/quality-map.yaml',
        },
      ],
      features: [
        {
          key: 'feature:002-shiplightai-cli',
          name: 'shiplightai CLI & Playwright Library',
          sourceRefs: [
            {
              path: '.quality/evidence/002-shiplightai-cli/quality-map.yaml',
              label: 'Quality map',
            },
          ],
          behaviors: [
            {
              key: 'behavior:exp-transpile',
              title: 'YAML tests transpile to correct Playwright spec files',
              evidenceDeclarations: [
                {
                  key: 'evidence:ev-standalone-export-logic',
                  path: 'apps/cli/tests/integration/standalone-export.test.ts',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(facts).toEqual([
      {
        key: 'repository-facts-complete',
        status: 'failed',
        severity: 'critical',
        summary: '1 repository fact problem prevented a complete scan.',
        exceptionEligible: false,
        findings: [
          expect.objectContaining({
            code: 'MISSING_EVIDENCE_FILE',
            featureKey: 'feature:002-shiplightai-cli',
            featureName: 'shiplightai CLI & Playwright Library',
            behaviorKey: 'behavior:exp-transpile',
            behaviorTitle: 'YAML tests transpile to correct Playwright spec files',
            evidenceKey: 'ev-standalone-export-logic',
            declarationPath: '.quality/evidence/002-shiplightai-cli/quality-map.yaml',
            affectedPath: 'apps/cli/tests/integration/standalone-export.test.ts',
            remediation:
              'Update the evidence declaration to reference an existing repository file, restore the missing file, or remove the declaration if it no longer applies. Then re-run the analysis.',
          }),
        ],
      },
      {
        key: 'workflow-evidence-complete',
        status: 'passed',
        severity: 'critical',
        summary: 'Workflow evidence collection stayed within the supported bounds.',
        exceptionEligible: false,
        findings: [],
      },
    ]);
  });

  it('reports truncated workflow inputs as a separate blocking system fact', () => {
    const facts = buildReleaseSystemFacts({
      factIntegrity: 'complete',
      evidenceTruncated: true,
      integrityDiagnostics: [],
      features: [],
    });

    expect(facts).toEqual([
      expect.objectContaining({
        key: 'repository-facts-complete',
        status: 'passed',
        findings: [],
      }),
      expect.objectContaining({
        key: 'workflow-evidence-complete',
        status: 'failed',
        severity: 'critical',
        exceptionEligible: false,
        findings: [
          expect.objectContaining({
            code: 'WORKFLOW_EVIDENCE_TRUNCATED',
            remediation: expect.stringContaining('collection bound'),
          }),
        ],
      }),
    ]);
  });
});

describe('systemFactFindingPresentation', () => {
  it('turns a missing evidence diagnostic into user-facing guidance', () => {
    expect(
      systemFactFindingPresentation({
        code: 'MISSING_EVIDENCE_FILE',
        message:
          'Evidence path apps/cli/test.ts referenced by ev-cli does not exist in the scanned repo.',
        remediation: 'Restore, replace, or remove the stale evidence declaration.',
        declarationPath: '.quality/evidence/cli/quality-map.yaml',
        affectedPath: 'apps/cli/test.ts',
      }),
    ).toEqual({
      title: 'Configured evidence file is missing',
      explanation:
        'This evidence declaration points to a file that does not exist at the analyzed commit.',
      recommendedAction:
        'Update the evidence declaration to reference an existing repository file, restore the missing file, or remove the declaration if it no longer applies. Then re-run the analysis.',
    });
  });

  it('uses deterministic quality-core guidance for other scanner diagnostics', () => {
    expect(
      systemFactFindingPresentation({
        code: 'INVALID_YAML',
        message: 'Could not parse quality-map.yaml.',
        remediation: 'Open the declaration and correct the reported repository fact.',
        declarationPath: '.quality/evidence/api/quality-map.yaml',
      }),
    ).toMatchObject({
      title: 'Invalid YAML',
      recommendedAction: 'Open the referenced YAML file, fix the syntax error, and scan again.',
    });
  });

  it('retains a quality-map diagnostic location as an exact-commit declaration', () => {
    const [repositoryFact] = buildReleaseSystemFacts({
      factIntegrity: 'incomplete',
      evidenceTruncated: false,
      integrityDiagnostics: [
        {
          severity: 'warning',
          code: 'UNKNOWN_FIELD',
          message: "Unknown quality-map field 'risk' is ignored.",
          mapPath: '.quality/evidence/web/quality-map.yaml',
          yamlPath: '$.expectations[0].risk',
          line: 32,
          column: 5,
          snippet: 'risk:',
        },
      ],
      features: [],
    });

    expect(repositoryFact?.findings).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_FIELD',
        declarationPath: '.quality/evidence/web/quality-map.yaml',
        yamlPath: '$.expectations[0].risk',
        line: 32,
        column: 5,
        snippet: 'risk:',
      }),
    ]);
  });
});
