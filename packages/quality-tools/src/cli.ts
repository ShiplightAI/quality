#!/usr/bin/env node
import type { CommandResult } from "./index";
import { runAnalyzeCommand } from "./commands/analyze";
import { runFixPromptsCommand } from "./commands/fix-prompts";
import { runObservationsCommand } from "./commands/observations";
import { runSchemaCommand } from "./commands/schema";
import { runSetsCommand, runSourcesCommand, runViewsCommand } from "./commands/sources";
import { runValidateCommand } from "./commands/validate";

function printHelp(): void {
  console.log(`Quality evidence tools.

Usage:
  quality-tools <command> [options]

Commands:
  analyze       Generate runtime-quality recommendations.
  fix-prompts   Generate structural quality-evidence fix prompts.
  observations  Produce and validate canonical workflow observations.
  schema        Print the canonical quality-map JSON Schema.
  sets          Print the canonical observation-set JSON Schema.
  sources       Print the canonical observation-source profile JSON Schema.
  validate      Validate a quality-map YAML file against the engine.
  views         Print the canonical saved-view JSON Schema.

Run "quality-tools <command> --help" for command options.
`);
}

async function main(argv: readonly string[]): Promise<CommandResult> {
  const [command] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    printHelp();
    return { exitCode: 0 };
  }

  if (command === "analyze") {
    return runAnalyzeCommand(argv.slice(1));
  }
  if (command === "fix-prompts") {
    return runFixPromptsCommand(argv.slice(1));
  }
  if (command === "observations") {
    return runObservationsCommand(argv.slice(1));
  }
  if (command === "schema") {
    return runSchemaCommand(argv.slice(1));
  }
  if (command === "sets") {
    return runSetsCommand(argv.slice(1));
  }
  if (command === "sources") {
    return runSourcesCommand(argv.slice(1));
  }
  if (command === "views") {
    return runViewsCommand(argv.slice(1));
  }
  if (command === "validate") {
    return runValidateCommand(argv.slice(1));
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  return { exitCode: 1 };
}

const result = await main(process.argv.slice(2));
process.exitCode = result.exitCode;
