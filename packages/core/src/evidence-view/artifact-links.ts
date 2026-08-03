import type { QualityMapSourceAttribution } from "@shiplightai/quality-map";
import type { FallbackEvidenceHint } from "../markdown-fallback/types";
import type {
  ArtifactPortability,
  ArtifactReferenceKind,
  ArtifactReferenceModel,
  EvidenceSourceAttribution
} from "./types";
import { markdownAttribution, structuredAttribution, unavailable } from "./source-attribution";

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function kindFor(value: string | undefined, hasUrl: boolean): ArtifactReferenceKind {
  if (hasUrl || (value !== undefined && isExternalUrl(value))) {
    return "external_url";
  }

  return value === undefined ? "unknown" : "local_path";
}

function portabilityFor(kind: ArtifactReferenceKind, value: string | undefined): ArtifactPortability {
  if (kind === "external_url") {
    return "external";
  }

  if (value === undefined) {
    return "unknown";
  }

  return isAbsolutePath(value) ? "absolute" : "relative";
}

function hrefFor(kind: ArtifactReferenceKind, value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (kind === "external_url") {
    return value;
  }

  return `file://${value}`;
}

export function artifactReferenceFromStructured(artifact: {
  readonly normalizedId: string;
  readonly localId: string;
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
  readonly type?: string;
  readonly sourceAttribution: QualityMapSourceAttribution;
}): ArtifactReferenceModel {
  const pathOrUrl = artifact.url ?? artifact.path;
  const kind = kindFor(pathOrUrl, artifact.url !== undefined);

  return {
    artifactId: artifact.normalizedId,
    label: artifact.label ?? artifact.path ?? artifact.url ?? artifact.localId,
    pathOrUrl: unavailable(pathOrUrl),
    kind,
    href: hrefFor(kind, pathOrUrl),
    clickableFileLink: kind === "local_path" && pathOrUrl !== undefined,
    availability: pathOrUrl === undefined ? "unavailable" : "unverified",
    portability: portabilityFor(kind, pathOrUrl),
    type: artifact.type ?? "unknown",
    sourceAttribution: structuredAttribution(artifact.sourceAttribution)
  };
}

export function artifactReferenceFromFallbackHint(
  targetId: string,
  hint: FallbackEvidenceHint,
  index: number
): ArtifactReferenceModel {
  const kind = hint.type === "url" ? "external_url" : hint.type === "path" ? "local_path" : "unknown";
  const sourceAttribution: EvidenceSourceAttribution = markdownAttribution(hint.sourceAttribution);

  return {
    artifactId: `${targetId}#fallback-artifact:${index}`,
    label: hint.label ?? hint.value,
    pathOrUrl: hint.value,
    kind,
    href: hrefFor(kind, hint.value),
    clickableFileLink: kind === "local_path",
    availability: "unverified",
    portability: portabilityFor(kind, hint.value),
    type: hint.type,
    sourceAttribution
  };
}
