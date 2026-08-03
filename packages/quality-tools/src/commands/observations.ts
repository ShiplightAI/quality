import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  ingestJunitXmlReport,
  ingestPlaywrightJsonReport,
  parseQualityObservationManifest,
  serializeQualityObservationManifest,
  serializeQualityObservationManifestJsonSchema,
  type NormalizedObservationRecord,
  type ObservationRecordStatus,
  type QualityObservationManifest,
  type QualityObservationManifestRecord
} from "@shiplightai/quality-core";
import { optionValue } from "./args";
import { printCommandError, type CommandResult } from "./result";

interface ProducerOptions {
  readonly positional: readonly string[];
  readonly output?: string;
  readonly commit?: string;
  readonly branch?: string;
  readonly dirty: boolean;
  readonly observedAt?: string;
  readonly runId?: string;
  readonly runUrl?: string;
  readonly path?: string;
  readonly testCase?: string;
  readonly status?: string;
  readonly note?: string;
  readonly help: boolean;
}

function printObservationsHelp(): void {
  console.log(`Produce and validate the canonical quality-observations JSON artifact.

Usage:
  quality-tools observations record --path <evidence-path> --status <status> --output <file> [metadata]
  quality-tools observations from-junit <report.xml> --output <file> [metadata]
  quality-tools observations from-playwright <report.json> --output <file> [metadata]
  quality-tools observations merge <manifest...> --output <file>
  quality-tools observations validate <manifest>
  quality-tools observations schema

Producer metadata:
  --commit <sha>          Observed revision. Defaults to GITHUB_SHA.
  --branch <name>         Optional branch. Defaults to GITHUB_REF_NAME.
  --dirty                 Mark the observed checkout dirty.
  --observed-at <time>    ISO timestamp. Defaults to the current time.
  --run-id <id>           Optional run identity. Defaults to GITHUB_RUN_ID.
  --run-url <url>         Optional run URL. Derived from GitHub environment when available.

Canonical statuses: pass, fail, error, skipped.
`);
}

function parseOptions(argv: readonly string[]): ProducerOptions {
  const positional: string[] = [];
  const values: {
    output?: string;
    commit?: string;
    branch?: string;
    observedAt?: string;
    runId?: string;
    runUrl?: string;
    path?: string;
    testCase?: string;
    status?: string;
    note?: string;
    dirty: boolean;
    help: boolean;
  } = {
    dirty: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      values.help = true;
      continue;
    }
    if (arg === "--dirty") {
      values.dirty = true;
      continue;
    }

    const keys: Record<string, keyof typeof values> = {
      "--output": "output",
      "--commit": "commit",
      "--branch": "branch",
      "--observed-at": "observedAt",
      "--run-id": "runId",
      "--run-url": "runUrl",
      "--path": "path",
      "--test-case": "testCase",
      "--status": "status",
      "--note": "note"
    };
    const key = keys[arg];
    if (key !== undefined) {
      const option = optionValue(argv, index, arg);
      values[key] = option.value as never;
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  return {
    positional,
    ...values
  };
}

function nonEmpty(value: string | undefined, label: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function isoTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function githubRunUrl(env: NodeJS.ProcessEnv, runId: string | undefined): string | undefined {
  if (runId === undefined || env.GITHUB_SERVER_URL === undefined || env.GITHUB_REPOSITORY === undefined) {
    return undefined;
  }
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`;
}

function producerMetadata(
  options: ProducerOptions,
  env: NodeJS.ProcessEnv = process.env
): Omit<QualityObservationManifest, "observations"> {
  const commit = nonEmpty(options.commit ?? env.GITHUB_SHA, "--commit or GITHUB_SHA");
  const branch = options.branch ?? env.GITHUB_REF_NAME;
  const observedAt = isoTimestamp(options.observedAt ?? new Date().toISOString(), "--observed-at");
  const runId = options.runId ?? env.GITHUB_RUN_ID;
  const runUrl = options.runUrl ?? githubRunUrl(env, runId);

  return {
    schema_version: 1,
    revision: {
      commit,
      ...(branch === undefined || branch.trim().length === 0 ? {} : { branch: branch.trim() }),
      ...(options.dirty ? { dirty: true } : {})
    },
    ...(runId === undefined
      ? {}
      : {
          run: {
            id: runId,
            ...(runUrl === undefined ? {} : { url: runUrl })
          }
        }),
    observed_at: observedAt
  };
}

function outputPath(options: ProducerOptions): string {
  return nonEmpty(options.output, "--output");
}

function writeManifest(destination: string, manifest: QualityObservationManifest): void {
  const validated = parseQualityObservationManifest(serializeQualityObservationManifest(manifest));
  if (validated.status !== "valid" || validated.document === undefined) {
    throw new Error(validated.diagnostics.map((entry) => entry.message).join(" "));
  }

  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, serializeQualityObservationManifest(validated.document), "utf8");
  console.log(destination);
}

function canonicalRecord(
  observation: NormalizedObservationRecord,
  envelopeObservedAt: string,
  qualifyProject: boolean
): QualityObservationManifestRecord {
  const path = observation.testFile ?? observation.testClass;
  if (path === undefined) {
    throw new Error(`Converted observation ${observation.observationId} has no proof path.`);
  }
  const testCase =
    qualifyProject && observation.testProject !== undefined
      ? `${observation.testCase ?? "test"} [${observation.testProject}]`
      : observation.testCase;

  return {
    path,
    ...(testCase === undefined ? {} : { test_case: testCase }),
    status: observation.status,
    ...(observation.observedAt === envelopeObservedAt ? {} : { observed_at: observation.observedAt }),
    ...(observation.note === undefined ? {} : { note: observation.note })
  };
}

function canonicalIdentity(observation: NormalizedObservationRecord): string {
  const path = observation.testFile ?? observation.testClass ?? "";
  return `${path.replaceAll("\\", "/")}::${observation.testCase?.trim().toLowerCase() ?? ""}`;
}

function throwIngestionDiagnostics(
  result: ReturnType<typeof ingestJunitXmlReport> | ReturnType<typeof ingestPlaywrightJsonReport>
): void {
  if (result.status !== "valid") {
    throw new Error(result.diagnostics.map((entry) => entry.message).join(" "));
  }
}

function convertNativeReport(kind: "junit" | "playwright", sourcePath: string, options: ProducerOptions): void {
  const metadata = producerMetadata(options);
  const report = readFileSync(sourcePath, "utf8");
  const revision = { ...metadata.revision };
  const result =
    kind === "junit"
      ? ingestJunitXmlReport({
          report_xml: report,
          observed_at: metadata.observed_at,
          revision
        })
      : ingestPlaywrightJsonReport({
          report_json: report,
          observed_at: metadata.observed_at,
          revision
        });

  throwIngestionDiagnostics(result);
  const identityCounts = new Map<string, number>();
  result.observations.forEach((entry) => {
    const identity = canonicalIdentity(entry);
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
  });
  writeManifest(outputPath(options), {
    ...metadata,
    observations: result.observations.map((entry) =>
      canonicalRecord(entry, metadata.observed_at, (identityCounts.get(canonicalIdentity(entry)) ?? 0) > 1)
    )
  });
}

function recordObservation(options: ProducerOptions): void {
  const status = options.status as ObservationRecordStatus | undefined;
  if (status === undefined || !new Set<ObservationRecordStatus>(["pass", "fail", "error", "skipped"]).has(status)) {
    throw new Error("--status must be one of: pass, fail, error, skipped.");
  }
  const metadata = producerMetadata(options);
  writeManifest(outputPath(options), {
    ...metadata,
    observations: [
      {
        path: nonEmpty(options.path, "--path"),
        ...(options.testCase === undefined ? {} : { test_case: nonEmpty(options.testCase, "--test-case") }),
        status,
        ...(options.note === undefined ? {} : { note: nonEmpty(options.note, "--note") })
      }
    ]
  });
}

function loadManifest(filePath: string): QualityObservationManifest {
  const parsed = parseQualityObservationManifest(readFileSync(filePath, "utf8"));
  if (parsed.status !== "valid" || parsed.document === undefined) {
    throw new Error(`${filePath}: ${parsed.diagnostics.map((entry) => entry.message).join(" ")}`);
  }
  return parsed.document;
}

function manifestRecordIdentity(record: QualityObservationManifestRecord): string {
  return `${record.path.replaceAll("\\", "/")}::${record.test_case?.trim().toLowerCase() ?? ""}`;
}

function manifestRecordIdentityLabel(record: QualityObservationManifestRecord): string {
  const normalizedPath = record.path.replaceAll("\\", "/");
  const normalizedTestCase = record.test_case?.trim().toLowerCase();
  return normalizedTestCase === undefined ? normalizedPath : `${normalizedPath} :: ${normalizedTestCase}`;
}

function mergeManifests(paths: readonly string[], options: ProducerOptions): void {
  if (paths.length === 0) {
    throw new Error("observations merge requires at least one manifest path.");
  }
  const manifests = paths.map(loadManifest);
  const first = manifests[0]!;
  for (const manifest of manifests.slice(1)) {
    if (manifest.revision.commit !== first.revision.commit) {
      throw new Error("Cannot merge quality observations from different revisions.");
    }
    if (manifest.run?.id !== first.run?.id) {
      throw new Error("Cannot merge quality observations from different runs.");
    }
  }

  const identityLabels = new Map<string, string>();
  const duplicateIdentityLabels = new Set<string>();
  manifests.forEach((manifest) => {
    manifest.observations.forEach((record) => {
      const identity = manifestRecordIdentity(record);
      const existingLabel = identityLabels.get(identity);
      if (existingLabel !== undefined) {
        duplicateIdentityLabels.add(existingLabel);
      } else {
        identityLabels.set(identity, manifestRecordIdentityLabel(record));
      }
    });
  });
  if (duplicateIdentityLabels.size > 0) {
    throw new Error(
      `Cannot merge duplicate observation identities: ${[...duplicateIdentityLabels].join(", ")}.`
    );
  }

  const observedAt = manifests
    .map((manifest) => manifest.observed_at)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]!;
  writeManifest(outputPath(options), {
    schema_version: 1,
    revision: first.revision,
    ...(first.run === undefined ? {} : { run: first.run }),
    observed_at: observedAt,
    observations: manifests.flatMap((manifest) =>
      manifest.observations.map((record) => ({
        ...record,
        ...(record.observed_at === undefined && manifest.observed_at !== observedAt
          ? { observed_at: manifest.observed_at }
          : {})
      }))
    )
  });
}

export async function runObservationsCommand(argv: readonly string[]): Promise<CommandResult> {
  try {
    const [subcommand, ...rest] = argv;
    if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
      printObservationsHelp();
      return { exitCode: 0 };
    }
    const options = parseOptions(rest);
    if (options.help) {
      printObservationsHelp();
      return { exitCode: 0 };
    }

    if (subcommand === "schema") {
      process.stdout.write(serializeQualityObservationManifestJsonSchema());
      return { exitCode: 0 };
    }
    if (subcommand === "validate") {
      if (options.positional.length !== 1) {
        throw new Error("observations validate requires one manifest path.");
      }
      loadManifest(options.positional[0]!);
      return { exitCode: 0 };
    }
    if (subcommand === "record") {
      if (options.positional.length > 0) {
        throw new Error("observations record does not accept positional paths.");
      }
      recordObservation(options);
      return { exitCode: 0 };
    }
    if (subcommand === "from-junit" || subcommand === "from-playwright") {
      if (options.positional.length !== 1) {
        throw new Error(`observations ${subcommand} requires one report path.`);
      }
      convertNativeReport(subcommand === "from-junit" ? "junit" : "playwright", options.positional[0]!, options);
      return { exitCode: 0 };
    }
    if (subcommand === "merge") {
      mergeManifests(options.positional, options);
      return { exitCode: 0 };
    }

    throw new Error(`Unknown observations subcommand: ${subcommand}`);
  } catch (error) {
    return printCommandError(error);
  }
}
