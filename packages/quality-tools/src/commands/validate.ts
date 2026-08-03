import { relative, resolve } from "node:path";
import { parseQualityMap, validateQualityMap } from "@shiplightai/quality-map";
import { printCommandError, type CommandResult } from "./result";

function printValidateHelp(): void {
  console.log(`Validate a quality-map YAML file against this quality-tools version's engine.

Usage:
  quality-tools validate <map-path>

Runs the real validator (not just a JSON Schema): unknown-field, required-field, duplicate-id,
source-ref, and evidence-path checks. Prints each diagnostic and exits non-zero if the map is
invalid or has any error-severity diagnostic (warnings do not fail).
`);
}

export function runValidateCommand(argv: readonly string[]): CommandResult {
  if (argv.includes("--help") || argv.includes("-h")) {
    printValidateHelp();
    return { exitCode: 0 };
  }

  try {
    const positional = argv.filter((arg) => !arg.startsWith("-"));
    if (positional.length !== 1) {
      throw new Error("validate takes exactly one <map-path>. Run 'quality-tools validate --help'.");
    }

    const mapPath = resolve(positional[0]!);
    const parsed = parseQualityMap({
      projectRelativePath: relative(process.cwd(), mapPath) || positional[0]!,
      resolvedLocalPath: mapPath,
    });
    const result = validateQualityMap(parsed);

    for (const diagnostic of result.diagnostics) {
      const line = `${diagnostic.severity.toUpperCase()} [${diagnostic.code}] ${diagnostic.yamlPath}: ${diagnostic.message}`;
      // Diagnostics go to stderr so stdout stays clean for scripting; the final verdict too.
      console.error(line);
    }

    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
    const warnings = result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
    const failed = result.status === "invalid" || errors > 0;

    if (failed) {
      console.error(`✗ ${positional[0]}: invalid (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"})`);
      return { exitCode: 1 };
    }

    console.error(`✓ ${positional[0]}: valid${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}`);
    return { exitCode: 0 };
  } catch (error) {
    return printCommandError(error);
  }
}
