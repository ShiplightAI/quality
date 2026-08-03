import type { OwnerExpectation, OwnerExpectationGroup } from "./types";

const priorityRank = new Map<string, number>([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3],
  ["unknown", 4]
]);

export function groupOwnerExpectations(
  expectations: readonly OwnerExpectation[]
): readonly OwnerExpectationGroup[] {
  const grouped = new Map<string, OwnerExpectation[]>();

  for (const expectation of expectations) {
    const group = grouped.get(expectation.priority) ?? [];
    group.push(expectation);
    grouped.set(expectation.priority, group);
  }

  return [...grouped.entries()]
    .map(([priority, groupExpectations]) => ({
      priority,
      expectations: groupExpectations.toSorted((left, right) => {
        const category = left.category.localeCompare(right.category);
        return category === 0 ? left.sourceOrder - right.sourceOrder : category;
      })
    }))
    .toSorted((left, right) => {
      const leftRank = priorityRank.get(left.priority) ?? 4;
      const rightRank = priorityRank.get(right.priority) ?? 4;
      return leftRank - rightRank;
    });
}

export function priorityRankFor(priority: string): number {
  return priorityRank.get(priority) ?? 4;
}
