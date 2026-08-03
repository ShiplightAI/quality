import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildRecommendationExport,
  generateFixPrompts,
  type BuildRecommendationExportInput,
  type RecommendationFixPromptRecord
} from "@shiplightai/quality-core";
import {
  nonNegativeIntegerOption,
  optionValue,
  parseProfileRunSelection,
  singlePositionalPath
} from "./args";
import { printCommandError, type CommandResult } from "./result";

interface AnalyzeArgs {
  readonly projectPath: string;
  readonly observationSetId?: string;
  readonly viewId?: string;
  readonly output?: string;
  readonly limit?: number;
  readonly selection?: BuildRecommendationExportInput["selection"];
  readonly help?: boolean;
}

function printAnalyzeHelp(): void {
  console.log(`Generate ranked runtime-quality recommendations and write them to a repo-owned JSON file.

Usage:
  quality-tools analyze --project-path <repo-root> --observation-set <set-id> [options]

Options:
  --project-path <path>   Target repo root. Defaults to the positional repo path or current directory.
  --observation-set <id>  Saved observation-set id to execute. Required.
  --view <id>             Optional saved QC view id. Defaults to whole-project.
  --output <path>         Override the output path. Defaults to .quality/generated/recommendations/<set>--<scope>.json
  --limit <n>             Limit the number of emitted ranked recommendations.
  --branch <name>         Optional branch override for the saved observation set run selection.
  --commit <sha>          Optional commit override for the saved observation set run selection.
  --profile-run <id=n>    Pin a saved profile to a specific workflow run id. Repeatable.
  --help                  Show this help.
`);
}

function parseAnalyzeArgs(argv: readonly string[]): AnalyzeArgs {
  const args: {
    projectPath?: string;
    observationSetId?: string;
    viewId?: string;
    output?: string;
    limit?: number;
    branch?: string;
    commit?: string;
    profiles?: NonNullable<BuildRecommendationExportInput["selection"]>["profiles"];
    help?: boolean;
  } = {};
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--project-path") {
      const option = optionValue(argv, index, arg);
      args.projectPath = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--observation-set") {
      const option = optionValue(argv, index, arg);
      args.observationSetId = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--view") {
      const option = optionValue(argv, index, arg);
      args.viewId = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--output") {
      const option = optionValue(argv, index, arg);
      args.output = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--limit") {
      const option = optionValue(argv, index, arg);
      args.limit = nonNegativeIntegerOption(option.value, arg);
      index = option.nextIndex;
      continue;
    }
    if (arg === "--branch") {
      const option = optionValue(argv, index, arg);
      args.branch = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--commit") {
      const option = optionValue(argv, index, arg);
      args.commit = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--profile-run") {
      const option = optionValue(argv, index, arg);
      args.profiles = [...(args.profiles ?? []), parseProfileRunSelection(option.value)];
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  return {
    projectPath: args.projectPath ?? singlePositionalPath(positional, "."),
    observationSetId: args.observationSetId,
    viewId: args.viewId,
    output: args.output,
    limit: args.limit,
    selection:
      args.branch === undefined &&
      args.commit === undefined &&
      (args.profiles?.length ?? 0) === 0
        ? undefined
        : {
            ...(args.branch === undefined ? {} : { branch: args.branch }),
            ...(args.commit === undefined ? {} : { commit: args.commit }),
            ...(args.profiles === undefined ? {} : { profiles: args.profiles })
          },
    help: args.help
  };
}

function loadToolEnv(projectPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const cwd = process.cwd();
  const projectRoot = resolve(projectPath);
  const candidates = [
    join(cwd, ".env.local"),
    join(cwd, "apps/web/.env.local"),
    join(projectRoot, ".env.local")
  ];

  for (const candidate of candidates) {
    loadEnvFile(candidate, env);
  }

  return env;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const quote = trimmed[0];
  if ((quote !== "\"" && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
    return trimmed;
  }
  const inner = trimmed.slice(1, -1);
  return quote === "\"" ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t") : inner;
}

function loadEnvFile(filePath: string, env: NodeJS.ProcessEnv): void {
  if (!existsSync(filePath)) {
    return;
  }
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || env[key] !== undefined) {
      continue;
    }
    env[key] = unquoteEnvValue(normalized.slice(separator + 1));
  }
}

function loadFixPromptRecords(projectPath: string): readonly RecommendationFixPromptRecord[] {
  try {
    return generateFixPrompts({
      repo: projectPath,
      format: "json",
      includeCovered: true
    }).records.map((record) => ({
      quality_map: record.quality_map,
      expectation_id: record.expectation_id,
      prompt: record.prompt
    }));
  } catch {
    return [];
  }
}

export async function runAnalyzeCommand(argv: readonly string[]): Promise<CommandResult> {
  try {
    const args = parseAnalyzeArgs(argv);
    if (args.help) {
      printAnalyzeHelp();
      return { exitCode: 0 };
    }
    if (args.observationSetId === undefined || args.observationSetId.length === 0) {
      throw new Error("--observation-set is required.");
    }

    const output = await buildRecommendationExport({
      projectPath: args.projectPath,
      observationSetId: args.observationSetId,
      viewId: args.viewId,
      output: args.output,
      limit: args.limit,
      selection: args.selection,
      env: loadToolEnv(args.projectPath),
      fixPromptRecords: loadFixPromptRecords(args.projectPath)
    });
    mkdirSync(dirname(output.outputPath), { recursive: true });
    writeFileSync(output.outputPath, `${JSON.stringify(output.file, null, 2)}\n`, "utf8");
    console.log(output.outputPath);
    return { exitCode: 0 };
  } catch (error) {
    return printCommandError(error);
  }
}
