import { describe, expect, it } from 'vitest';
import {
  ReleaseComponentNotFound,
  releaseComponentsSchema,
  resolveReleaseComponentFeatureIds,
} from './components';

describe('release component resolution', () => {
  const views = [
    { id: 'web', featureIds: ['accounts', 'shared'] },
    { id: 'api', featureIds: ['public-api', 'shared'] },
  ];

  it('combines the complete feature scope of every requested component', () => {
    expect([...resolveReleaseComponentFeatureIds(views, ['web', 'api'], [])]).toEqual([
      'accounts',
      'shared',
      'public-api',
    ]);
  });

  it('rejects a component that has no matching repository view', () => {
    expect(() => resolveReleaseComponentFeatureIds(views, ['web', 'worker'], [])).toThrow(
      new ReleaseComponentNotFound(['worker']),
    );
  });

  it('treats an empty component list as every project Feature, including Features outside Views', () => {
    expect(
      [...resolveReleaseComponentFeatureIds(views, [], ['accounts', 'public-api', 'unassigned'])],
    ).toEqual(['accounts', 'public-api', 'unassigned']);
  });

  it('allows an empty component list and normalizes selected components', () => {
    expect(releaseComponentsSchema.parse([])).toEqual([]);
    expect(releaseComponentsSchema.parse([' api ', 'web', 'api'])).toEqual(['api', 'web']);
  });
});
