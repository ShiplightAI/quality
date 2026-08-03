import { serializeQualityMapJsonSchema } from "@shiplightai/quality-map";
import { printCommandError, type CommandResult } from "./result";

function printSchemaHelp(): void {
  console.log(`Print the canonical quality-map JSON Schema (draft 2020-12) to stdout.

Usage:
  quality-tools schema

The schema is emitted from this quality-tools version's own contract constants, so it always
matches the validator that "quality-tools validate" runs — no separate copy to keep in sync.
Redirect to a file if you need one:
  quality-tools schema > quality-map.schema.json
`);
}

export function runSchemaCommand(argv: readonly string[]): CommandResult {
  if (argv.includes("--help") || argv.includes("-h")) {
    printSchemaHelp();
    return { exitCode: 0 };
  }

  try {
    process.stdout.write(serializeQualityMapJsonSchema());
    return { exitCode: 0 };
  } catch (error) {
    return printCommandError(error);
  }
}
