import type {
  IndexTargetRow,
  TargetDestinationKind,
  TargetNavigationContext
} from "./types";

export function createTargetNavigationContext(
  target: IndexTargetRow,
  destinationKind: TargetDestinationKind
): TargetNavigationContext {
  return {
    destinationKind,
    targetId: target.targetId,
    displayName: target.displayName,
    sourceClassification: target.sourceClassification,
    sourceReferences: target.sourceReferences
  };
}
