import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface SizeBaseline {
  readonly baselineVersion: string;
  readonly baselinePackedBytes: number;
  readonly baselineUnpackedBytes: number;
  readonly maxIncreasePercent: number;
}

interface PackFile {
  readonly path?: string;
  readonly size?: number;
}

interface PackResult {
  readonly size?: number;
  readonly unpackedSize?: number;
  readonly files?: readonly PackFile[];
}

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

// Release gate for @shiplightai/quality-ui, mirroring packages/quality-tools/scripts/check-package-size.mjs.
//
// Package size is a user-experience concern: this package is consumed by two Next apps, so anything
// shipped here lands in an install (and, for the stylesheet, in a browser). The gate enforces four
// things a reviewer cannot eyeball on a diff:
//
//   1. Size may not grow more than `maxIncreasePercent` over the recorded baseline. Exceeding it is
//      not a hard "no" — it requires deliberately re-baselining, which is the explicit approval.
//   2. Source maps must never ship.
//   3. Only built `dist/` artifacts and the README ship — never TypeScript source or tests.
//   4. Declared dependencies and peers must stay external, never bundled into the output. A second
//      copy of React or the quality engine inside a consumer's bundle is the worst size regression
//      available and is invisible in a size delta if it lands with an otherwise-shrinking build.

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const baselinePath = resolve(packageRoot, "package-size.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as SizeBaseline;
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

// `npm pack --dry-run` only measures — no tarball is written and no workspace:* is resolved.
const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: packageRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const [pack] = JSON.parse(output) as PackResult[];
if (pack === undefined) {
  throw new Error("npm pack --dry-run returned no package.");
}
// Bind to locals so the validation narrows the types for the rest of the script; `Number.isInteger`
// is a runtime guard the compiler cannot follow through an optional property.
const packedSize = pack.size;
const unpackedSize = pack.unpackedSize;
if (!Number.isInteger(packedSize) || !Number.isInteger(unpackedSize)) {
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
  // The stylesheet, shipped as a resolvable asset (exports["./styles.css"]).
  /^dist\/styles\.css$/u,
];

for (const file of pack.files) {
  const filePath = String(file.path ?? "");
  if (filePath.endsWith(".map")) {
    throw new Error(`Source map must not be included in the npm package: ${filePath}`);
  }
  if (/\.tsx?$/u.test(filePath) && !filePath.endsWith(".d.ts")) {
    throw new Error(`TypeScript source must not be included in the npm package: ${filePath}`);
  }
  if (/\.test\./u.test(filePath)) {
    throw new Error(`Test file must not be included in the npm package: ${filePath}`);
  }
  if (!allowedFilePatterns.some((pattern) => pattern.test(filePath))) {
    throw new Error(`Unexpected file in npm package: ${filePath}`);
  }
}

// Dependencies and peers must be imported, not inlined. Checked by looking for a bare import of
// each in the emitted JS: if a package were bundled, no import of it would remain.
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as Manifest;
const mustStayExternal = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
].filter((name) => name !== "react-dom"); // pulled in by react/jsx-runtime, never imported directly

const emittedJs = pack.files
  .map((f: PackFile) => String(f.path ?? ""))
  .filter((p) => /^dist\/.*\.js$/u.test(p))
  .map((p) => readFileSync(resolve(packageRoot, p), "utf8"))
  .join("\n");

for (const name of mustStayExternal) {
  // Matches `from'pkg'` and `from'pkg/subpath'` in the minified output.
  const imported = new RegExp(String.raw`from\s*["']${name.replace("/", "\\/")}(?:/[^"']+)?["']`, "u").test(emittedJs);
  if (!imported) {
    throw new Error(
      `${name} is declared as a dependency/peer but never imported by the build — it is either ` +
        `bundled into the output (ship it as an import instead) or an unused dependency (remove it).`,
    );
  }
}

function checkSize(label: string, current: number, baselineValue: number): void {
  const maxSize = Math.floor(baselineValue * (1 + maxIncreasePercent / 100));
  const delta = current - baselineValue;
  const percent = (delta / baselineValue) * 100;

  console.log(
    `@shiplightai/quality-ui ${label} size: ${current} bytes ` +
      `(baseline ${baselineValue}, ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%, limit ${maxSize})`,
  );

  if (current > maxSize) {
    throw new Error(
      `${label} size ${current} exceeds the ${maxIncreasePercent}% release limit (${maxSize} bytes).\n` +
        `If the growth is intended, update package-size.json (baselineVersion, baselinePackedBytes, ` +
        `baselineUnpackedBytes) in the same change — re-baselining is the explicit approval.`,
    );
  }
}

checkSize("packed", packedSize as number, baselinePackedSize);
checkSize("unpacked", unpackedSize as number, baselineUnpackedSize);
