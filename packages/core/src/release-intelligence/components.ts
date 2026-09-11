import { z } from 'zod';

export const releaseComponentsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .transform((components) =>
    [...new Set(components)].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );

interface ComponentView {
  readonly id: string;
  readonly featureIds: readonly string[];
}
export function resolveReleaseComponentFeatureIds(
  views: readonly ComponentView[],
  components: readonly string[],
  allFeatureIds: readonly string[],
): ReadonlySet<string> {
  if (components.length === 0) return new Set(allFeatureIds);
  const viewsById = new Map(views.map((view) => [view.id, view]));
  const unknown = components.filter((component) => !viewsById.has(component));
  if (unknown.length > 0) throw new ReleaseComponentNotFound(unknown);

  const featureIds = new Set<string>();
  for (const component of components) {
    for (const featureId of viewsById.get(component)!.featureIds) featureIds.add(featureId);
  }
  return featureIds;
}

export class ReleaseComponentNotFound extends Error {
  readonly components: readonly string[];

  constructor(components: readonly string[]) {
    super(`Release component Views not found: ${components.join(', ')}.`);
    this.components = [...components];
  }
}
