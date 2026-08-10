function limitFor(baselineBytes, maxIncreasePercent) {
  return Math.floor(baselineBytes * (1 + maxIncreasePercent / 100));
}

function approvalProblem(approval, packageVersion, currentPackedBytes, currentUnpackedBytes) {
  if (approval === null || approval === undefined) {
    return "no approval is recorded";
  }
  if (approval.version !== packageVersion) {
    return `the recorded approval for ${String(approval.version)} does not apply to ${packageVersion}`;
  }
  if (
    !Number.isInteger(approval.packedBytes) ||
    !Number.isInteger(approval.unpackedBytes) ||
    approval.packedBytes < currentPackedBytes ||
    approval.unpackedBytes < currentUnpackedBytes
  ) {
    return "the recorded approval does not cover the measured artifact";
  }
  if (typeof approval.approvedBy !== "string" || approval.approvedBy.trim().length === 0) {
    return "the recorded approval does not identify its human approver";
  }
  if (typeof approval.reason !== "string" || approval.reason.trim().length === 0) {
    return "the recorded approval does not explain why the increase is accepted";
  }
  return undefined;
}

export function evaluatePackageSize(input) {
  if (!Number.isFinite(input.maxIncreasePercent) || input.maxIncreasePercent < 0) {
    throw new Error("package-size.json maxIncreasePercent must be a non-negative number.");
  }
  for (const key of ["packedBytes", "unpackedBytes"]) {
    if (!Number.isInteger(input.baseline[key]) || input.baseline[key] <= 0) {
      throw new Error(`baseline ${key} must be a positive integer.`);
    }
  }

  const measurements = [
    {
      label: "packed",
      current: input.currentPackedBytes,
      baseline: input.baseline.packedBytes
    },
    {
      label: "unpacked",
      current: input.currentUnpackedBytes,
      baseline: input.baseline.unpackedBytes
    }
  ].map((measurement) => ({
    ...measurement,
    limit: limitFor(measurement.baseline, input.maxIncreasePercent),
    percent: ((measurement.current - measurement.baseline) / measurement.baseline) * 100
  }));

  const exceeded = measurements.filter((measurement) => measurement.current > measurement.limit);
  if (exceeded.length === 0) {
    return { measurements, usedApproval: false };
  }

  const problem = approvalProblem(
    input.approvedIncrease,
    input.packageVersion,
    input.currentPackedBytes,
    input.currentUnpackedBytes
  );
  if (problem !== undefined) {
    const details = exceeded
      .map(
        ({ label, current, limit }) =>
          `${label} size ${current} exceeds the ${input.maxIncreasePercent}% release limit (${limit} bytes)`
      )
      .join("; ");
    throw new Error(
      `${details}; explicit human approval is required because ${problem}. ` +
        "A human maintainer may record an exact, version-specific approvedIncrease in package-size.json. " +
        "Agents must not create or claim that approval."
    );
  }

  return { measurements, usedApproval: true };
}
