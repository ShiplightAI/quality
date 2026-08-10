#!/usr/bin/env node
/* global console, fetch */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePackageSize } from "./package-size-policy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const policy = JSON.parse(readFileSync(resolve(packageRoot, "package-size.json"), "utf8"));
const packageName = String(packageManifest.name);
const packageVersion = String(packageManifest.version);

// The comparison deliberately fails closed when npm is unavailable: publishing
// without a known previous artifact would bypass the release policy. The error
// distinguishes registry access failures from an actual size violation.
let registryOutput;
try {
  registryOutput = execFileSync(
    "npm",
    [
      "view",
      `${packageName}@latest`,
      "version",
      "dist.tarball",
      "dist.unpackedSize",
      "dist.integrity",
      "versions",
      "--json"
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
} catch (cause) {
  throw new Error(`Could not read the published ${packageName} baseline from npm.`, { cause });
}
const registry = JSON.parse(registryOutput);
const baselineVersion = String(registry.version ?? "");
const baselineTarball = String(registry["dist.tarball"] ?? "");
const baselineUnpackedBytes = Number(registry["dist.unpackedSize"]);
const baselineIntegrity = String(registry["dist.integrity"] ?? "");
if (baselineVersion.length === 0 || baselineTarball.length === 0) {
  throw new Error(`npm did not return the current published ${packageName} release.`);
}
if (!Number.isInteger(baselineUnpackedBytes) || baselineUnpackedBytes <= 0) {
  throw new Error(`npm did not return the unpacked size for ${packageName}@${baselineVersion}.`);
}
const integrityMatch = /^([a-z0-9]+)-([A-Za-z0-9+/=]+)$/u.exec(baselineIntegrity);
if (integrityMatch === null) {
  throw new Error(`npm did not return valid integrity metadata for ${packageName}@${baselineVersion}.`);
}

const publishedVersions = registry.versions;
if (
  Array.isArray(publishedVersions) &&
  publishedVersions.includes(packageVersion) &&
  packageVersion !== baselineVersion
) {
  throw new Error(
    `${packageName}@${packageVersion} is older than the current published release ${baselineVersion}.`
  );
}

const baselineResponse = await fetch(baselineTarball);
if (!baselineResponse.ok) {
  throw new Error(
    `Could not download ${packageName}@${baselineVersion} for the size comparison: HTTP ${baselineResponse.status}.`
  );
}
const baselineBytes = Buffer.from(await baselineResponse.arrayBuffer());
const baselineDigest = createHash(integrityMatch[1]).update(baselineBytes).digest("base64");
if (baselineDigest !== integrityMatch[2]) {
  throw new Error(`The downloaded ${packageName}@${baselineVersion} tarball failed its npm integrity check.`);
}
const baselinePackedBytes = baselineBytes.byteLength;

const packRoot = mkdtempSync(join(tmpdir(), "quality-tools-size-"));
let pack;
let currentPackedBytes;
let currentUnpackedBytes;
let measurementComplete = false;
try {
  const packOutput = execFileSync(
    "pnpm",
    ["pack", "--pack-destination", packRoot, "--json"],
    { cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  pack = JSON.parse(packOutput);
  const archiveName = String(pack.filename ?? "");
  if (archiveName.length === 0 || !Array.isArray(pack.files)) {
    throw new Error("pnpm pack did not return the package archive and file list.");
  }
  // Current pnpm returns an absolute filename. Resolve a bare filename against
  // --pack-destination as well so a harmless output-format change cannot turn
  // the release check into an opaque ENOENT.
  const archivePath = isAbsolute(archiveName)
    ? archiveName
    : resolve(packRoot, basename(archiveName));
  currentPackedBytes = statSync(archivePath).size;

  // npm-compatible tarballs always extract under package/.
  const extractRoot = resolve(packRoot, "package");
  execFileSync("tar", ["-xzf", archivePath, "-C", packRoot], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  if (!existsSync(extractRoot) || !statSync(extractRoot).isDirectory()) {
    throw new Error("pnpm pack produced an archive without the expected package/ directory.");
  }
  function directorySize(path) {
    return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
      const entryPath = resolve(path, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlink must not be included in the npm package: ${entryPath}`);
      }
      return total + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size);
    }, 0);
  }
  currentUnpackedBytes = directorySize(extractRoot);

  const allowedFilePatterns = [
    /^LICENSE$/u,
    /^README\.md$/u,
    /^package\.json$/u,
    /^dist\/[^/]+\.js$/u,
    /^dist\/[^/]+\.d\.ts$/u,
    /^dist\/quality-map\.schema\.json$/u,
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
  measurementComplete = true;
} finally {
  // The archive exists only to measure the exact pnpm-published artifact.
  // It is never retained or used as the input to `pnpm publish`.
  if (!measurementComplete) {
    rmSync(packRoot, { recursive: true, force: true });
  }
}

try {
  const result = evaluatePackageSize({
    packageVersion,
    currentPackedBytes,
    currentUnpackedBytes,
    baseline: {
      version: baselineVersion,
      packedBytes: baselinePackedBytes,
      unpackedBytes: baselineUnpackedBytes
    },
    maxIncreasePercent: Number(policy.maxIncreasePercent),
    approvedIncrease: policy.approvedIncrease
  });

  for (const measurement of result.measurements) {
    console.log(
      `${packageName} ${measurement.label} size: ${measurement.current} bytes ` +
        `(previous ${baselineVersion}: ${measurement.baseline}, ` +
        `${measurement.percent >= 0 ? "+" : ""}${measurement.percent.toFixed(2)}%, ` +
        `limit ${measurement.limit})`
    );
  }
  if (result.usedApproval) {
    console.warn(
      `${packageName}@${packageVersion} exceeds the standard size limit and uses the human approval ` +
        `recorded by ${policy.approvedIncrease.approvedBy}: ${policy.approvedIncrease.reason}`
    );
  }
} finally {
  rmSync(packRoot, { recursive: true, force: true });
}
