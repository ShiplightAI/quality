import type { AnalyticsFilters, MetricDrilldownRecord } from "./types";

export function applyAnalyticsFilters(
  records: readonly MetricDrilldownRecord[],
  filters: AnalyticsFilters = {}
): readonly MetricDrilldownRecord[] {
  return records.filter((record) => {
    if (filters.priority !== undefined && filters.priority !== "all" && record.priority !== filters.priority) {
      return false;
    }
    if (
      filters.gapCategory !== undefined &&
      filters.gapCategory !== "all" &&
      record.gapCategory !== filters.gapCategory
    ) {
      return false;
    }
    if (
      filters.sourceClassification !== undefined &&
      filters.sourceClassification !== "all" &&
      record.sourceClassification !== filters.sourceClassification
    ) {
      return false;
    }
    if (filters.gating !== undefined && filters.gating !== "all" && record.gatingState !== filters.gating) {
      return false;
    }
    if (filters.riskState !== undefined && filters.riskState !== "all" && record.riskState !== filters.riskState) {
      return false;
    }

    return true;
  });
}
