import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateFixPrompts } from "@shiplightai/quality-core";
import {
  nonNegativeIntegerOption,
  optionValue,
  singlePositionalPath
} from "./args";
import { printCommandError, type CommandResult } from "./result";

interface FixPromptsArgs {
  readonly projectPath: string;
  readonly format: "markdown" | "json";
  readonly output?: string;
  readonly limit?: number;
  readonly target?: string;
  readonly includeCovered: boolean;
  readonly help?: boolean;
}

function printFixPromptsHelp(): void {
  console.log(`Generate coding-agent fix prompts from quality-evidence quality maps.

Usage:
  quality-tools fix-prompts --project-path <repo-root> [options]

Options:
  --project-path <path>   Target repo root. Defaults to the positional repo path or current directory.
  --format markdown|json  Output format. Default: markdown.
  --output <path>         Write output to a file instead of stdout.
  --limit <n>             Emit only the highest-priority n prompts.
  --target <target-id>    Emit prompts for one quality-map target id.
  --include-covered       Include covered/high-confidence quality checks and future proof recommendations too.
  --help                  Show this help.
`);
}

function parseFixPromptsArgs(argv: readonly string[]): FixPromptsArgs {
  const args: {
    projectPath?: string;
    format?: "markdown" | "json";
    output?: string;
    limit?: number;
    target?: string;
    includeCovered?: boolean;
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
    if (arg === "--format") {
      const option = optionValue(argv, index, arg);
      if (option.value !== "markdown" && option.value !== "json") {
        throw new Error("--format must be markdown or json.");
      }
      args.format = option.value;
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
    if (arg === "--target") {
      const option = optionValue(argv, index, arg);
      args.target = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg === "--include-covered") {
      args.includeCovered = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  return {
    projectPath: args.projectPath ?? singlePositionalPath(positional, "."),
    format: args.format ?? "markdown",
    output: args.output,
    limit: args.limit,
    target: args.target,
    includeCovered: args.includeCovered ?? false,
    help: args.help
  };
}

export function runFixPromptsCommand(argv: readonly string[]): CommandResult {
  try {
    const args = parseFixPromptsArgs(argv);
    if (args.help) {
      printFixPromptsHelp();
      return { exitCode: 0 };
    }

    const result = generateFixPrompts({
      repo: args.projectPath,
      format: args.format,
      output: args.output,
      limit: args.limit,
      target: args.target,
      includeCovered: args.includeCovered
    });

    if (result.outputPath !== undefined) {
      mkdirSync(dirname(result.outputPath), { recursive: true });
      writeFileSync(result.outputPath, `${result.output}\n`, "utf8");
    } else {
      console.log(result.output);
    }

    return { exitCode: 0 };
  } catch (error) {
    return printCommandError(error);
  }
}
