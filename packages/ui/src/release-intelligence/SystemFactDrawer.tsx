"use client";

import {
  Accordion,
  Anchor,
  Badge,
  Code,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  buildReleaseIssueFixPromptForView,
  githubSourceUrl,
  parseReleaseSystemFactFindings,
  systemFactFindingPresentation,
  type ReleaseIssueEvidenceView,
  type ReleaseSystemFactFinding,
} from "@shiplightai/quality-core/release-intelligence";
import type { ReactNode } from "react";
import { systemFactLabel } from "./AnalysisHealth";
import { CopyFixPromptButton } from "./CopyFixPromptButton";
import "./IssueEvidenceDrawer.css";

export function SystemFactDrawer({
  detail,
  issueId = null,
  systemFactId = null,
  onClose,
}: {
  readonly detail: ReleaseIssueEvidenceView;
  readonly issueId?: string | null;
  readonly systemFactId?: string | null;
  readonly onClose: () => void;
}): React.ReactElement {
  const selectedIssue = detail.issues.find((item) => item.id === issueId && item.systemFactId);
  const fact = systemFactId
    ? detail.systemFacts.find((item) => item.id === systemFactId)
    : selectedIssue
      ? detail.systemFacts.find((item) => item.id === selectedIssue.systemFactId)
      : undefined;
  const issue =
    selectedIssue ?? detail.issues.find((item) => item.systemFactId === fact?.id) ?? undefined;
  const fixPrompt = issue ? buildReleaseIssueFixPromptForView(detail, issue) : undefined;
  const findings = parseReleaseSystemFactFindings(fact?.findings);
  const appliedRules = fact
    ? detail.rules.filter((rule) => ruleReferencesSystemFact(rule.inputs, fact.factKey))
    : [];
  const blocksRelease =
    issue?.blocksWithoutException ?? appliedRules.some((rule) => rule.effect === "block");
  const label = fact ? systemFactLabel(fact.factKey) : "";

  return (
    <Drawer
      opened={Boolean(fact)}
      onClose={onClose}
      position="right"
      size={540}
      title="Analysis health"
      scrollAreaComponent={ScrollArea.Autosize}
      padding="lg"
      classNames={{
        header: "ri-drawer-header",
        title: "ri-drawer-title",
        body: "ri-drawer-body",
      }}
    >
      {fact && (
        <Stack gap={0}>
          <Text size="xs" c="dimmed">{label}</Text>

          {fact.status === "passed" ? (
            <>
              <Title order={2} size="h3" mt={6} mb={6} maw={450}>{label} is healthy</Title>
              <Text size="sm" c="dimmed" lh={1.5}>No problems were found for this check.</Text>
              <Text size="sm" mt="xs" lh={1.5}>{fact.summary}</Text>
            </>
          ) : (
            <>
              <Badge color={blocksRelease ? "red" : "yellow"} variant="light" w="fit-content" mt={6}>
                {blocksRelease ? "Blocks release" : "Warning"}
              </Badge>
              <Title order={2} size="h3" mt={8} mb={6} maw={450}>
                {findings.length} {findings.length === 1 ? "problem prevents" : "problems prevent"}{" "}
                a reliable release decision.
              </Title>
              <Text size="sm" c="dimmed" lh={1.5}>
                Shiplight could not fully analyze the inputs required for this check.
              </Text>
              {issue && fixPrompt && (
                <Group mt="md"><CopyFixPromptButton prompt={fixPrompt} /></Group>
              )}
            </>
          )}

          {findings.length > 0 && (
            <DrawerSection title="Problems to fix">
              <Accordion defaultValue="problem-0" variant="separated" mt="xs">
                {findings.map((finding, index) => {
                  const presentation = systemFactFindingPresentation(finding);
                  return (
                    <Accordion.Item value={`problem-${index}`} key={`${finding.code}:${index}`}>
                      <Accordion.Control>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                          <Badge size="sm" variant="light" circle>{index + 1}</Badge>
                          <div>
                            <Text size="sm" fw={600}>{presentation.title}</Text>
                            {finding.declarationPath && (
                              <Text size="xs" c="dimmed" mt={2} lineClamp={1}>
                                {finding.declarationPath}
                              </Text>
                            )}
                          </div>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <ProblemDetails
                          detail={detail}
                          finding={finding}
                          explanation={presentation.explanation}
                          recommendedAction={presentation.recommendedAction}
                        />
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </DrawerSection>
          )}

          <DrawerSection title="Release decision">
            {fact.status === "passed" ? (
              <Text size="sm" py="sm">This check does not affect the release decision.</Text>
            ) : (
              <Stack gap="xs" py="sm">
                <Text size="sm">
                  {blocksRelease
                    ? "The release is blocked because the analysis inputs are incomplete."
                    : "The release decision includes a warning from this check."}
                </Text>
                {!fact.exceptionEligible && (
                  <Text size="sm" c="dimmed">Analysis-integrity problems cannot be waived.</Text>
                )}
              </Stack>
            )}
          </DrawerSection>

          {(findings.length > 0 || appliedRules.length > 0) && (
            <details className="ri-drawer-technical-details">
              <summary className="ri-drawer-technical-summary">Technical details</summary>
              <Stack gap="xs" className="ri-drawer-technical-body">
                <KeyValueRow label="System check" value={fact.factKey} code />
                <KeyValueRow label="Commit" value={detail.release.commitSha} code />
                {findings.map((finding, index) => (
                  <Stack gap={4} key={`${finding.code}:technical:${index}`}>
                    {findings.length > 1 && (
                      <Text size="xs" fw={600} c="dimmed">Problem {index + 1}</Text>
                    )}
                    <KeyValueRow label="Diagnostic code" value={finding.code} code />
                    {finding.evidenceKey && (
                      <KeyValueRow label="Evidence key" value={finding.evidenceKey} code />
                    )}
                    <Text size="xs" c="dimmed">{finding.message}</Text>
                  </Stack>
                ))}
                {appliedRules.map((rule) => (
                  <KeyValueRow
                    key={rule.id}
                    label="Release rule"
                    value={`${rule.ruleKey}: ${rule.status}`}
                    code
                  />
                ))}
              </Stack>
            </details>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

function ProblemDetails({
  detail,
  finding,
  explanation,
  recommendedAction,
}: {
  readonly detail: ReleaseIssueEvidenceView;
  readonly finding: ReleaseSystemFactFinding;
  readonly explanation: string;
  readonly recommendedAction: string;
}): React.ReactElement {
  const declarationHref = finding.declarationPath
    ? safeGithubSourceUrl(
        detail.repository,
        detail.release.commitSha,
        finding.declarationPath,
        finding.line,
      )
    : null;
  return (
    <Stack gap="md" pb="xs">
      <Text size="sm" lh={1.5}>{explanation}</Text>
      {(finding.declarationPath || finding.featureName) && (
        <Stack gap={4}>
          <FieldLabel>Where to fix it</FieldLabel>
          {finding.declarationPath && declarationHref ? (
            <Anchor href={declarationHref} target="_blank" rel="noreferrer" size="sm">
              {finding.declarationPath}
              {finding.line ? `:${finding.line}${finding.column ? `:${finding.column}` : ""}` : ""}{" "}
              ↗
            </Anchor>
          ) : finding.declarationPath ? (
            <Code>{finding.declarationPath}</Code>
          ) : (
            <Text size="sm">{finding.featureName}</Text>
          )}
        </Stack>
      )}
      {finding.affectedPath && (
        <Stack gap={4}>
          <FieldLabel>
            {finding.code === "MISSING_EVIDENCE_FILE" ? "Missing referenced path" : "Affected path"}
          </FieldLabel>
          <Code>{finding.affectedPath}</Code>
        </Stack>
      )}
      {(finding.yamlPath || finding.snippet) && (
        <Stack gap={4}>
          <FieldLabel>Configuration entry</FieldLabel>
          {finding.yamlPath && <Code>{finding.yamlPath}</Code>}
          {finding.snippet && <Code>{finding.snippet}</Code>}
        </Stack>
      )}
      {(finding.behaviorTitle || finding.featureName) && (
        <Stack gap={4}>
          <FieldLabel>
            {finding.behaviorTitle ? "What Shiplight could not verify" : "Affected Feature"}
          </FieldLabel>
          <Text size="sm">{finding.behaviorTitle ?? finding.featureName}</Text>
          {finding.behaviorTitle && finding.featureName && (
            <Text size="xs" c="dimmed">Feature: {finding.featureName}</Text>
          )}
        </Stack>
      )}
      <Stack gap={4}>
        <FieldLabel>How to fix</FieldLabel>
        <Text size="sm" lh={1.5}>{recommendedAction}</Text>
      </Stack>
    </Stack>
  );
}

function safeGithubSourceUrl(
  repository: string,
  commitSha: string,
  path: string,
  line?: number,
): string | null {
  try {
    const sourceUrl = githubSourceUrl(repository, commitSha, { path });
    return line ? `${sourceUrl}#L${line}` : sourceUrl;
  } catch {
    return null;
  }
}

function ruleReferencesSystemFact(
  value: Readonly<Record<string, unknown>>,
  factKey: string,
): boolean {
  const systemFactKeys = value.systemFactKeys;
  return Array.isArray(systemFactKeys) && systemFactKeys.includes(factKey);
}

function DrawerSection({ children, title }: { readonly children: ReactNode; readonly title: string }): React.ReactElement {
  return (
    <Stack gap={0} mt="lg" className="ri-drawer-section">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>{title}</Text>
      {children}
    </Stack>
  );
}

function FieldLabel({ children }: { readonly children: ReactNode }): React.ReactElement {
  return <Text size="xs" fw={600} c="dimmed" tt="uppercase">{children}</Text>;
}

function KeyValueRow({
  label,
  value,
  code = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly code?: boolean;
}): React.ReactElement {
  return (
    <Group justify="space-between" className="ri-drawer-row" align="flex-start" wrap="nowrap" py="xs">
      <Text size="xs" c="dimmed">{label}</Text>
      {code ? (
        <Code fz="xs" maw={330} style={{ overflowWrap: "anywhere" }}>{value}</Code>
      ) : (
        <Text size="xs" fw={500} ta="right">{value}</Text>
      )}
    </Group>
  );
}
