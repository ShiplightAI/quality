"use client";

import type { GapRecord } from "@shiplightai/quality-core/gap-triage";
import type { DetailPanelRecord } from "@shiplightai/quality-core/workspace";

interface FixPromptResponse {
  readonly prompt: string;
}

interface FixPromptLookup {
  readonly expectationId: string;
  readonly qualityMapPath: string;
}

function lookupForGap(gap: GapRecord): FixPromptLookup | undefined {
  if (gap.sourceClassification !== "structured_quality_map") {
    return undefined;
  }

  const qualityMapPath = gap.sourceReferences.find((reference) =>
    reference.path?.endsWith("quality-map.yaml") === true
  )?.path;
  const expectationId = gap.expectationId.split("#expectation:").at(-1);

  if (qualityMapPath === undefined || expectationId === undefined || expectationId.length === 0) {
    return undefined;
  }

  return {
    expectationId,
    qualityMapPath
  };
}

function lookupForGapDetail(detail: DetailPanelRecord): FixPromptLookup | undefined {
  if (detail.kind !== "gap") {
    return undefined;
  }

  const qualityMapPath = detail.sourceAttribution.find((reference) =>
    reference.path?.endsWith("quality-map.yaml") === true
  )?.path;
  const qualityCheckReference = detail.relatedRecords.find((record) =>
    record.label === "Quality check" && record.value.includes("#expectation:")
  )?.value;
  const expectationId = qualityCheckReference?.split("#expectation:").at(-1);

  if (qualityMapPath === undefined || expectationId === undefined || expectationId.length === 0) {
    return undefined;
  }

  return {
    expectationId,
    qualityMapPath
  };
}

async function requestFixPrompt(projectPath: string, lookup: FixPromptLookup): Promise<string | undefined> {
  const response = await fetch("/api/quality-explorer/fix-prompt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      expectationId: lookup.expectationId,
      projectPath,
      qualityMapPath: lookup.qualityMapPath
    })
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = await response.json() as FixPromptResponse;
  return payload.prompt;
}

export async function canonicalFixPromptForGap(
  gap: GapRecord,
  projectPath: string | undefined
): Promise<string | undefined> {
  if (projectPath === undefined) {
    return undefined;
  }

  const lookup = lookupForGap(gap);
  return lookup === undefined ? undefined : requestFixPrompt(projectPath, lookup);
}

export async function canonicalFixPromptForDetail(
  detail: DetailPanelRecord,
  projectPath: string | undefined
): Promise<string | undefined> {
  if (projectPath === undefined) {
    return undefined;
  }

  const lookup = lookupForGapDetail(detail);
  return lookup === undefined ? undefined : requestFixPrompt(projectPath, lookup);
}
