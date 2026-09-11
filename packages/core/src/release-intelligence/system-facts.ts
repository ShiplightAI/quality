import { diagnosticGuidanceFor } from '../project-index/diagnostic-guidance';
import { z } from 'zod';
import type { ReleaseSystemFact, ReleaseSystemFactFinding, SourceReference } from './types';

const ReleaseSystemFactFindingSchema = z.object({
  code: z.string(),
  message: z.string(),
  remediation: z.string(),
  featureKey: z.string().optional(),
  featureName: z.string().optional(),
  behaviorKey: z.string().optional(),
  behaviorTitle: z.string().optional(),
  evidenceKey: z.string().optional(),
  declarationPath: z.string().optional(),
  affectedPath: z.string().optional(),
  yamlPath: z.string().optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  snippet: z.string().optional(),
});

export function parseReleaseSystemFactFindings(
  value: unknown,
): readonly ReleaseSystemFactFinding[] {
  const parsed = z.array(ReleaseSystemFactFindingSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export interface SystemFactFindingPresentation {
  readonly title: string;
  readonly explanation: string;
  readonly recommendedAction: string;
}

interface SystemFactFeature {
  readonly key: string;
  readonly name: string;
  readonly sourceRefs: readonly SourceReference[];
  readonly behaviors: readonly {
    readonly key: string;
    readonly title: string;
    readonly evidenceDeclarations: readonly {
      readonly key: string;
      readonly path?: string;
    }[];
  }[];
}

// Pure transformation: callers own persistence so identical frozen inputs remain reproducible.
export function buildReleaseSystemFacts(input: {
  readonly factIntegrity: 'complete' | 'incomplete';
  readonly evidenceTruncated: boolean;
  readonly integrityDiagnostics: readonly Record<string, unknown>[];
  readonly features: readonly SystemFactFeature[];
}): ReleaseSystemFact[] {
  const repositoryFindings =
    input.factIntegrity === 'incomplete'
      ? input.integrityDiagnostics.map((diagnostic) =>
          repositoryFinding(diagnostic, input.features),
        )
      : [];
  const repositoryProblemCount = repositoryFindings.length;
  const repositoryFact: ReleaseSystemFact = {
    key: 'repository-facts-complete',
    status: input.factIntegrity === 'complete' ? 'passed' : 'failed',
    severity: 'critical',
    summary:
      input.factIntegrity === 'complete'
        ? 'Repository facts compiled completely.'
        : `${repositoryProblemCount} repository fact ${repositoryProblemCount === 1 ? 'problem' : 'problems'} prevented a complete scan.`,
    exceptionEligible: false,
    findings: repositoryFindings,
  };
  const workflowFact: ReleaseSystemFact = {
    key: 'workflow-evidence-complete',
    status: input.evidenceTruncated ? 'failed' : 'passed',
    severity: 'critical',
    summary: input.evidenceTruncated
      ? 'GitHub returned more workflow evidence inputs than the collector can safely process.'
      : 'Workflow evidence collection stayed within the supported bounds.',
    exceptionEligible: false,
    findings: input.evidenceTruncated
      ? [
          {
            code: 'WORKFLOW_EVIDENCE_TRUNCATED',
            message:
              'GitHub returned more workflow evidence inputs than the bounded collector retained.',
            remediation:
              'Reduce the workflow evidence set or increase the supported collection bound before re-analysis.',
          },
        ]
      : [],
  };
  return [repositoryFact, workflowFact];
}

function repositoryFinding(
  diagnostic: Record<string, unknown>,
  features: readonly SystemFactFeature[],
): ReleaseSystemFactFinding {
  const code = typeof diagnostic.code === 'string' ? diagnostic.code : 'REPOSITORY_FACT_ERROR';
  const message =
    typeof diagnostic.message === 'string'
      ? diagnostic.message
      : 'A repository fact could not be compiled.';
  const declaredAt =
    typeof diagnostic.affectedPath === 'string'
      ? diagnostic.affectedPath
      : typeof diagnostic.mapPath === 'string'
        ? diagnostic.mapPath
        : undefined;
  const yamlPath = typeof diagnostic.yamlPath === 'string' ? diagnostic.yamlPath : undefined;
  const line = positiveInteger(diagnostic.line);
  const column = positiveInteger(diagnostic.column);
  const snippet = typeof diagnostic.snippet === 'string' ? diagnostic.snippet : undefined;
  const missingEvidence =
    // quality-core currently exposes the evidence key and missing path only in this message.
    // Its emitted format is locked by scan-project.contract.test.ts and this parser by
    // system-facts.test.ts; update both contracts when upgrading that diagnostic.
    code === 'MISSING_EVIDENCE_FILE'
      ? /^Evidence path (.+) referenced by (.+) does not exist in the scanned repo\.$/.exec(message)
      : null;
  const affectedPath = missingEvidence?.[1];
  const evidenceKey = missingEvidence?.[2];
  const feature = features.find((item) =>
    item.sourceRefs.some((reference) => reference.path === declaredAt),
  );
  const behavior = feature?.behaviors.find((item) =>
    item.evidenceDeclarations.some(
      (evidence) =>
        evidence.path === affectedPath ||
        (evidenceKey !== undefined && evidence.key.endsWith(`:${evidenceKey}`)),
    ),
  );
  return {
    code,
    message,
    remediation:
      code === 'MISSING_EVIDENCE_FILE'
        ? 'Update the evidence declaration to reference an existing repository file, restore the missing file, or remove the declaration if it no longer applies. Then re-run the analysis.'
        : 'Open the declaration and correct the reported repository fact before re-analysis.',
    ...(feature ? { featureKey: feature.key, featureName: feature.name } : {}),
    ...(behavior ? { behaviorKey: behavior.key, behaviorTitle: behavior.title } : {}),
    ...(evidenceKey ? { evidenceKey } : {}),
    ...(declaredAt ? { declarationPath: declaredAt } : {}),
    ...(affectedPath ? { affectedPath } : {}),
    ...(yamlPath ? { yamlPath } : {}),
    ...(line ? { line } : {}),
    ...(column ? { column } : {}),
    ...(snippet ? { snippet } : {}),
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function systemFactFindingPresentation(
  finding: ReleaseSystemFactFinding,
): SystemFactFindingPresentation {
  if (finding.code === 'MISSING_EVIDENCE_FILE') {
    return {
      title: 'Configured evidence file is missing',
      explanation:
        'This evidence declaration points to a file that does not exist at the analyzed commit.',
      recommendedAction:
        'Update the evidence declaration to reference an existing repository file, restore the missing file, or remove the declaration if it no longer applies. Then re-run the analysis.',
    };
  }
  if (finding.code === 'component_feature_quality_map_missing') {
    return {
      title: 'Feature has no quality map',
      explanation: 'A selected Feature does not declare the quality map needed for analysis.',
      recommendedAction:
        'Add a quality map for the Feature or update the project configuration to reference the correct map, then re-run the analysis.',
    };
  }
  if (finding.code === 'component_feature_quality_map_unavailable') {
    return {
      title: 'Quality map could not be scanned',
      explanation:
        'A selected Feature references a quality map that was not available in the analyzed commit.',
      recommendedAction:
        'Restore the referenced quality map or correct its project configuration path, then re-run the analysis.',
    };
  }
  if (finding.code === 'REPOSITORY_FACTS_INCOMPLETE') {
    return {
      title: 'Repository configuration scan did not complete',
      explanation: finding.message,
      recommendedAction:
        'Review the other repository configuration problems, correct the affected inputs, and re-run the analysis.',
    };
  }
  if (finding.code === 'WORKFLOW_EVIDENCE_TRUNCATED') {
    return {
      title: 'Workflow evidence exceeded the collection limit',
      explanation:
        'The workflow returned more evidence inputs than Shiplight could safely retain for this analysis.',
      recommendedAction: finding.remediation,
    };
  }

  const guidance = diagnosticGuidanceFor({
    severity: 'error',
    code: finding.code,
    message: finding.message,
    ...(finding.declarationPath ? { sourcePath: finding.declarationPath } : {}),
    ...(finding.affectedPath ? { affectedPath: finding.affectedPath } : {}),
    ...(finding.featureKey ? { affectedTargetId: finding.featureKey } : {}),
  });
  return {
    title: sentenceCase(guidance.title),
    explanation: guidance.explanation,
    recommendedAction: guidance.recommendedAction,
  };
}

function sentenceCase(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
