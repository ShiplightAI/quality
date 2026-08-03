import { gapCategoryOrder } from "./classify-gaps";
import type { GapCategoryGroup, GapFilters, GapRecord, GapSummaryItem } from "./types";

export function applyGapFilters(
  records: readonly GapRecord[],
  filters: GapFilters = {}
): readonly GapRecord[] {
  return records.filter((record) => {
    // Accepted-risk gaps are not open gaps: they drop out of the filtered list,
    // groups, and counts. The unfiltered `records` still carries them so the
    // feature page can surface them (with an un-accept action).
    if (record.accepted) {
      return false;
    }
    if (filters.category !== undefined && filters.category !== "all" && record.category !== filters.category) {
      return false;
    }
    if (filters.priority !== undefined && filters.priority !== "all" && record.priority !== filters.priority) {
      return false;
    }
    if (
      filters.evidenceState !== undefined &&
      filters.evidenceState !== "all" &&
      record.evidenceState !== filters.evidenceState
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
    if (filters.residualRisk === "with-risk" && record.residualRisk === "unavailable") {
      return false;
    }
    if (filters.residualRisk === "without-risk" && record.residualRisk !== "unavailable") {
      return false;
    }

    return true;
  });
}

export function groupGapRecords(records: readonly GapRecord[]): readonly GapCategoryGroup[] {
  const groups: GapCategoryGroup[] = [];

  for (const category of gapCategoryOrder) {
    // Accepted-risk gaps are excluded from groups (and therefore from the
    // summary counts built on top of groupGapRecords).
    const groupedRecords = records.filter((record) => record.category === category && !record.accepted);
    if (groupedRecords.length > 0) {
      groups.push({
        category,
        label: groupedRecords[0]?.categoryLabel ?? category,
        records: groupedRecords
      });
    }
  }

  return groups;
}

export function summarizeGapRecords(records: readonly GapRecord[]): readonly GapSummaryItem[] {
  return groupGapRecords(records).map((group) => ({
    category: group.category,
    label: group.label,
    count: group.records.length
  }));
}
