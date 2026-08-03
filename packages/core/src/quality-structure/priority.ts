/**
 * Governed priority weight. `priority` (P0–P3) is the single effort lever — there
 * is no separate authored risk weight. Higher weight = higher importance, used to
 * rank gaps and weight aggregate scores.
 */
export function priorityWeight(priority: string | undefined): number {
  const normalized = priority?.toUpperCase();
  if (normalized === "P0") {
    return 5;
  }
  if (normalized === "P1") {
    return 3;
  }
  if (normalized === "P2") {
    return 2;
  }
  return 1;
}
