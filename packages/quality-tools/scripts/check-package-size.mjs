#!/usr/bin/env node
/* global console, fetch */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePackageSize } from "./package-size-policy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const policy = JSON.parse(readFileSync(resolve(packageRoot, "package-size.json"), "utf8"));
const packageName = String(packageManifest.name);
const packageVersion = String(packageManifest.version);

const registryOutput = execFileSync(
  "npm",
  ["view", `${packageName}@latest`, "version", "dist.tarball", "dist.unpackedSize", "--json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
);
const registry = JSON.parse(registryOutput);
const baselineVersion = String(registry.version ?? "");
const baselineTarball = String(registry["dist.tarball"] ?? "");
const baselineUnpackedBytes = Number(registry["dist.unpackedSize"]);
if (baselineVersion.length === 0 || baselineTarball.length === 0) {
  throw new Error(`npm did not return the current published ${packageName} release.`);
}
if (!Number.isInteger(baselineUnpackedBytes) || baselineUnpackedBytes <= 0) {
  throw new Error(`npm did not return the unpacked size for ${packageName}@${baselineVersion}.`);
}

const publishedVersions = JSON.parse(
  execFileSync("npm", ["view", packageName, "versions", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
);
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
const baselinePackedBytes = (await baselineResponse.arrayBuffer()).byteLength;

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
  const archivePath = String(pack.filename ?? "");
  if (archivePath.length === 0 || !Array.isArray(pack.files)) {
    throw new Error("pnpm pack did not return the package archive and file list.");
  }
  currentPackedBytes = statSync(archivePath).size;

  const extractRoot = resolve(packRoot, "package");
  execFileSync("tar", ["-xzf", archivePath, "-C", packRoot], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  function directorySize(path) {
    return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
      const entryPath = resolve(path, entry.name);
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
  const measurements = evaluatePackageSize({
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

  for (const measurement of measurements) {
    console.log(
      `${packageName} ${measurement.label} size: ${measurement.current} bytes ` +
        `(previous ${baselineVersion}: ${measurement.baseline}, ` +
        `${measurement.percent >= 0 ? "+" : ""}${measurement.percent.toFixed(2)}%, ` +
        `limit ${measurement.limit})`
    );
  }
} finally {
  rmSync(packRoot, { recursive: true, force: true });
}
