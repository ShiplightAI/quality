import type { NormalizedQualityGraph } from "@shiplightai/quality-map";
import type { BaselineComparison, MetricDrilldownRecord } from "./types";

export function buildBaselineComparison(input: {
  readonly graph?: NormalizedQualityGraph;
  readonly currentSnapshotId: string;
  readonly records: readonly MetricDrilldownRecord[];
}): BaselineComparison {
  const baselineAlias = input.graph?.target.aliases.find((alias) => alias.startsWith("baseline:"));

  if (baselineAlias === undefined) {
    return {
      state: "unavailable",
      currentSnapshotId: input.currentSnapshotId,
      changedRecords: [],
      addedRecords: [],
      removedRecords: [],
      uncertaintyNotes: ["No explicit prior analytics snapshot or release baseline identity was supplied."]
    };
  }

  return {
    state: "available",
    baselineId: baselineAlias.slice("baseline:".length),
    currentSnapshotId: input.currentSnapshotId,
    changedRecords: input.records.slice(0, 5),
    addedRecords: input.records.filter((record) => record.reasonIncluded.toLowerCase().includes("missing")),
    removedRecords: [],
    uncertaintyNotes: ["Comparison is limited to source-provided baseline identity and current records."]
  };
}
