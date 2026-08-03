#!/usr/bin/env node
/* global console */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const baselinePath = resolve(packageRoot, "package-size.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const maxIncreasePercent = Number(baseline.maxIncreasePercent);
const baselinePackedSize = Number(baseline.baselinePackedBytes);
const baselineUnpackedSize = Number(baseline.baselineUnpackedBytes);

if (!Number.isFinite(maxIncreasePercent) || maxIncreasePercent < 0) {
  throw new Error("package-size.json maxIncreasePercent must be a non-negative number.");
}
if (!Number.isInteger(baselinePackedSize) || baselinePackedSize <= 0) {
  throw new Error("package-size.json baselinePackedBytes must be a positive integer.");
}
if (!Number.isInteger(baselineUnpackedSize) || baselineUnpackedSize <= 0) {
  throw new Error("package-size.json baselineUnpackedBytes must be a positive integer.");
}

// `npm pack --dry-run` only measures size — no tarball, no workspace:* resolution — so the "never npm pack" publish rule does not apply here.
const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: packageRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
const [pack] = JSON.parse(output);
if (pack === undefined || !Number.isInteger(pack.size) || !Number.isInteger(pack.unpackedSize)) {
  throw new Error("npm pack --dry-run did not return package sizes.");
}
if (!Array.isArray(pack.files)) {
  throw new Error("npm pack --dry-run did not return package file entries.");
}

const allowedFilePatterns = [
  /^README\.md$/u,
  /^package\.json$/u,
  /^dist\/[^/]+\.js$/u,
  /^dist\/[^/]+\.d\.ts$/u,
  // The quality-map JSON Schema shipped as a resolvable asset (exports["./quality-map.schema.json"]).
  /^dist\/quality-map\.schema\.json$/u,
  // The canonical workflow-observation contract (exports["./quality-observations.schema.json"]).
  /^dist\/quality-observations\.schema\.json$/u
];

for (const file of pack.files) {
  const filePath = String(file.path ?? "");
  if (filePath.endsWith(".map")) {
    throw new Error(`Source map must not be included in the npm package: ${filePath}`);
  }
  if (!allowedFilePatterns.some((pattern) => pattern.test(filePath))) {
    throw new Error(`Unexpected file in npm package: ${filePath}`);
  }
}

function checkSize(label, current, baselineValue) {
  const maxSize = Math.floor(baselineValue * (1 + maxIncreasePercent / 100));
  const delta = current - baselineValue;
  const percent = (delta / baselineValue) * 100;

  console.log(
    `@shiplightai/quality-tools ${label} size: ${current} bytes ` +
      `(baseline ${baselineValue}, ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%, limit ${maxSize})`
  );

  if (current > maxSize) {
    throw new Error(
      `${label} size ${current} exceeds the ${maxIncreasePercent}% release limit (${maxSize} bytes).`
    );
  }
}

checkSize("packed", pack.size, baselinePackedSize);
checkSize("unpacked", pack.unpackedSize, baselineUnpackedSize);
