import { describe, expect, it } from "vitest";
import { evaluatePackageSize } from "./package-size-policy.mjs";

const baseline = {
  version: "0.3.2",
  packedBytes: 10_000,
  unpackedBytes: 100_000
};

describe("quality-tools package-size policy", () => {
  it("allows growth up to one percent over the published release", () => {
    const result = evaluatePackageSize({
      packageVersion: "0.3.3",
      currentPackedBytes: 10_100,
      currentUnpackedBytes: 101_000,
      baseline,
      maxIncreasePercent: 1,
      approvedIncrease: null
    });
    expect(result.usedApproval).toBe(false);
  });

  it("rejects growth above one percent without explicit human approval", () => {
    expect(() =>
      evaluatePackageSize({
        packageVersion: "0.3.3",
        currentPackedBytes: 10_101,
        currentUnpackedBytes: 100_000,
        baseline,
        maxIncreasePercent: 1,
        approvedIncrease: null
      })
    ).toThrow(/explicit human approval/u);
  });

  it("accepts a human approval for the exact release and measured bounds", () => {
    const result = evaluatePackageSize({
      packageVersion: "0.3.3",
      currentPackedBytes: 10_200,
      currentUnpackedBytes: 102_000,
      baseline,
      maxIncreasePercent: 1,
      approvedIncrease: {
        version: "0.3.3",
        packedBytes: 10_200,
        unpackedBytes: 102_000,
        approvedBy: "Jane Maintainer",
        reason: "Reviewed dependency required for the new command."
      }
    });
    expect(result.usedApproval).toBe(true);
  });

  it("rejects approval for another version or a smaller artifact", () => {
    const common = {
      packageVersion: "0.3.3",
      currentPackedBytes: 10_200,
      currentUnpackedBytes: 102_000,
      baseline,
      maxIncreasePercent: 1
    };
    expect(() =>
      evaluatePackageSize({
        ...common,
        approvedIncrease: {
          version: "0.3.4",
          packedBytes: 10_200,
          unpackedBytes: 102_000,
          approvedBy: "Jane Maintainer",
          reason: "Reviewed."
        }
      })
    ).toThrow(/does not apply to 0\.3\.3/u);
    expect(() =>
      evaluatePackageSize({
        ...common,
        approvedIncrease: {
          version: "0.3.3",
          packedBytes: 10_199,
          unpackedBytes: 102_000,
          approvedBy: "Jane Maintainer",
          reason: "Reviewed."
        }
      })
    ).toThrow(/does not cover the measured artifact/u);
  });
});
