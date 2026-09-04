import {
  serializeObservationSetsJsonSchema,
  serializeObservationSourceProfilesJsonSchema,
  serializeSavedViewsJsonSchema
} from "@shiplightai/quality-core";
import { printCommandError, type CommandResult } from "./result";

function printSourcesHelp(): void {
  console.log(`Print the canonical observation-source profile JSON Schema to stdout.

Usage:
  quality-tools sources schema

The schema is emitted from this quality-tools version's own contract constants, so it always
matches the parser that reads .quality/config/observation-sources.yaml — there is no second
copy to keep in sync. Fetch it rather than vendoring it:
  quality-tools sources schema > observation-sources.schema.json
`);
}

export function runSourcesCommand(argv: readonly string[]): CommandResult {
  return runSchemaSubcommand(
    argv,
    printSourcesHelp,
    "sources",
    serializeObservationSourceProfilesJsonSchema
  );
}

function printSetsHelp(): void {
  console.log(`Print the canonical observation-set JSON Schema to stdout.

Usage:
  quality-tools sets schema

Emitted from this quality-tools version's own contract constants, so it always
matches the parser that reads .quality/config/observation-sets.yaml.
`);
}

export function runSetsCommand(argv: readonly string[]): CommandResult {
  return runSchemaSubcommand(argv, printSetsHelp, "sets", serializeObservationSetsJsonSchema);
}

function printViewsHelp(): void {
  console.log(`Print the canonical saved-view JSON Schema to stdout.

Usage:
  quality-tools views schema

Emitted from this quality-tools version's own contract constants, so it always
matches the parser that reads .quality/config/views.yaml.
`);
}

export function runViewsCommand(argv: readonly string[]): CommandResult {
  return runSchemaSubcommand(argv, printViewsHelp, "views", serializeSavedViewsJsonSchema);
}

// The three config schemas differ only in which serializer they print, so the
// argument handling — help, unknown subcommand, error shape — lives once.
function runSchemaSubcommand(
  argv: readonly string[],
  printHelp: () => void,
  command: string,
  serialize: () => string
): CommandResult {
  const subcommand = argv[0];

  if (argv.includes("--help") || argv.includes("-h") || subcommand === undefined) {
    printHelp();
    return { exitCode: 0 };
  }

  try {
    if (subcommand !== "schema") {
      throw new Error(`Unknown ${command} subcommand: ${subcommand}`);
    }

    process.stdout.write(serialize());
    return { exitCode: 0 };
  } catch (error) {
    return printCommandError(error);
  }
}
