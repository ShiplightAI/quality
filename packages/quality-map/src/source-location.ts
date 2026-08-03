import {
  LineCounter,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node,
  type Pair
} from "yaml";
import type {
  QualityMapSource,
  QualityMapSourceAttribution
} from "./types";

interface LocatedSnippet {
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
}

interface YamlPathSegment {
  readonly key: string;
  readonly index?: number;
}

interface PathStep {
  readonly node: Node | null | undefined;
  readonly locatedNode: Node | null | undefined;
  readonly nextIndex: number;
  readonly terminalFallback?: PathStep;
}

interface LocationContext {
  readonly contents: Node | null | undefined;
  readonly lineCounter: LineCounter;
}

const LOCATION_CONTEXT_CACHE_LIMIT = 25;
const locationContextCache = new Map<string, LocationContext>();

function locationContextFor(rawText: string): LocationContext {
  const cached = locationContextCache.get(rawText);
  if (cached !== undefined) {
    locationContextCache.delete(rawText);
    locationContextCache.set(rawText, cached);
    return cached;
  }

  const lineCounter = new LineCounter();
  const document = parseDocument(rawText, { lineCounter, prettyErrors: false });
  const context = { contents: document.contents, lineCounter };
  locationContextCache.set(rawText, context);

  if (locationContextCache.size > LOCATION_CONTEXT_CACHE_LIMIT) {
    const oldestKey = locationContextCache.keys().next().value;
    if (oldestKey !== undefined) {
      locationContextCache.delete(oldestKey);
    }
  }

  return context;
}

function parseYamlPath(yamlPath: string): readonly YamlPathSegment[] {
  if (yamlPath === "$" || !yamlPath.startsWith("$")) {
    return [];
  }

  const segments: YamlPathSegment[] = [];
  let cursor = 1;

  while (cursor < yamlPath.length) {
    const parsed = parseNextSegment(yamlPath, cursor);
    if (parsed === undefined) {
      return [];
    }
    segments.push(parsed.segment);
    cursor = parsed.nextCursor;
  }

  return segments;
}

function parseNextSegment(
  yamlPath: string,
  cursor: number
): { readonly segment: YamlPathSegment; readonly nextCursor: number } | undefined {
  if (yamlPath[cursor] === ".") {
    return parseDottedSegment(yamlPath, cursor + 1);
  }

  if (yamlPath[cursor] === "[" && yamlPath[cursor + 1] === "\"") {
    return parseQuotedSegment(yamlPath, cursor);
  }

  return undefined;
}

function parseDottedSegment(
  yamlPath: string,
  cursor: number
): { readonly segment: YamlPathSegment; readonly nextCursor: number } {
  const keyStart = cursor;
  while (cursor < yamlPath.length && yamlPath[cursor] !== "." && yamlPath[cursor] !== "[") {
    cursor += 1;
  }

  return parseIndexSuffix(yamlPath, yamlPath.slice(keyStart, cursor), cursor);
}

function parseQuotedSegment(
  yamlPath: string,
  cursor: number
): { readonly segment: YamlPathSegment; readonly nextCursor: number } | undefined {
  const quoteStart = cursor + 1;
  let quoteEnd = quoteStart + 1;
  let isEscaped = false;

  while (quoteEnd < yamlPath.length) {
    const character = yamlPath[quoteEnd];
    if (character === "\"" && !isEscaped) {
      break;
    }
    isEscaped = character === "\\" && !isEscaped;
    if (character !== "\\") {
      isEscaped = false;
    }
    quoteEnd += 1;
  }

  if (quoteEnd >= yamlPath.length || yamlPath[quoteEnd + 1] !== "]") {
    return undefined;
  }

  let parsedKey: unknown;
  try {
    parsedKey = JSON.parse(yamlPath.slice(quoteStart, quoteEnd + 1)) as unknown;
  } catch {
    return undefined;
  }
  if (typeof parsedKey !== "string") {
    return undefined;
  }

  return parseIndexSuffix(yamlPath, parsedKey, quoteEnd + 2);
}

function parseIndexSuffix(
  yamlPath: string,
  key: string,
  cursor: number
): { readonly segment: YamlPathSegment; readonly nextCursor: number } {
  if (yamlPath[cursor] !== "[" || yamlPath[cursor + 1] === "\"") {
    return { segment: { key }, nextCursor: cursor };
  }

  const indexEnd = yamlPath.indexOf("]", cursor);
  if (indexEnd === -1) {
    return {
      segment: { key: `${key}${yamlPath.slice(cursor)}` },
      nextCursor: yamlPath.length
    };
  }

  const indexText = yamlPath.slice(cursor + 1, indexEnd);
  if (!/^\d+$/.test(indexText)) {
    return {
      segment: { key: `${key}${yamlPath.slice(cursor, indexEnd + 1)}` },
      nextCursor: indexEnd + 1
    };
  }

  return {
    segment: { key, index: Number(indexText) },
    nextCursor: indexEnd + 1
  };
}

function keyForPair(pair: Pair<unknown, unknown>): string | undefined {
  return isScalar(pair.key) ? String(pair.key.value) : undefined;
}

function findPair(node: Node, key: string): Pair<Node, Node | null> | undefined {
  if (!isMap<Node, Node | null>(node)) {
    return undefined;
  }

  return node.items.find((pair) => keyForPair(pair) === key);
}

function findTerminalDottedPair(
  node: Node,
  segments: readonly YamlPathSegment[],
  segmentIndex: number
): Pair<Node, Node | null> | undefined {
  if (!isMap<Node, Node | null>(node) || segments[segmentIndex]?.index !== undefined) {
    return undefined;
  }

  const dottedKey = segments.slice(segmentIndex).map((segment) => segment.key).join(".");
  return node.items.find((pair) => keyForPair(pair) === dottedKey);
}

function terminalDottedStep(
  node: Node,
  segments: readonly YamlPathSegment[],
  segmentIndex: number
): PathStep | undefined {
  const pair = findTerminalDottedPair(node, segments, segmentIndex);
  return pair === undefined
    ? undefined
    : {
        node: pair.value,
        locatedNode: pair.key,
        nextIndex: segments.length
      };
}

function stepIntoPath(
  node: Node | null | undefined,
  segments: readonly YamlPathSegment[],
  segmentIndex: number
): PathStep | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }

  const segment = segments[segmentIndex];
  if (segment === undefined) {
    return undefined;
  }

  const terminalFallback = terminalDottedStep(node, segments, segmentIndex);
  const pair = findPair(node, segment.key);
  if (pair === undefined) {
    return terminalFallback;
  }

  if (segment.index === undefined) {
    return {
      node: pair.value,
      locatedNode: pair.key,
      nextIndex: segmentIndex + 1,
      terminalFallback
    };
  }

  if (!isSeq<Node>(pair.value)) {
    return terminalFallback;
  }

  const item = pair.value.items[segment.index];
  return {
    node: item,
    locatedNode: item,
    nextIndex: segmentIndex + 1,
    terminalFallback
  };
}

function snippetForLine(rawText: string, line: number): string | undefined {
  return rawText.split(/\r?\n/)[line - 1]?.trim();
}

function locateNode(
  rawText: string,
  lineCounter: LineCounter,
  node: Node | null | undefined
): LocatedSnippet {
  if (node?.range === undefined || node.range === null) {
    return {};
  }

  const position = lineCounter.linePos(node.range[0]);

  if (position.line === 0) {
    return {};
  }

  return {
    line: position.line,
    column: position.col,
    snippet: snippetForLine(rawText, position.line)
  };
}

export function locateYamlPath(rawText: string, yamlPath: string): LocatedSnippet {
  const { contents, lineCounter } = locationContextFor(rawText);
  const segments = parseYamlPath(yamlPath);

  if (segments.length === 0) {
    return locateNode(rawText, lineCounter, contents);
  }

  let node: Node | null | undefined = contents;
  let locatedNode: Node | null | undefined = node;
  let segmentIndex = 0;
  let pendingTerminalFallback: PathStep | undefined;

  while (segmentIndex < segments.length) {
    const step = stepIntoPath(node, segments, segmentIndex);
    if (step === undefined) {
      if (pendingTerminalFallback === undefined) {
        return {};
      }
      node = pendingTerminalFallback.node;
      locatedNode = pendingTerminalFallback.locatedNode;
      segmentIndex = pendingTerminalFallback.nextIndex;
      break;
    }

    pendingTerminalFallback = step.terminalFallback ?? pendingTerminalFallback;
    node = step.node;
    locatedNode = step.locatedNode;
    segmentIndex = step.nextIndex;
  }

  if (locatedNode?.range === undefined || locatedNode.range === null) {
    return {};
  }

  const position = lineCounter.linePos(locatedNode.range[0]);
  if (position.line === 0) {
    return {};
  }

  return {
    line: position.line,
    column: position.col,
    snippet: snippetForLine(rawText, position.line)
  };
}

export function sourceAttributionFor(
  source: QualityMapSource,
  yamlPath: string,
  rawText: string
): QualityMapSourceAttribution {
  return {
    sourceClassification: "structured_quality_map",
    mapPath: source.projectRelativePath,
    yamlPath,
    ...locateYamlPath(rawText, yamlPath)
  };
}
