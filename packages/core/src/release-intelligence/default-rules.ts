import type { ReleasePolicy } from './policy';

export const DEFAULT_PRODUCTION_POLICY: ReleasePolicy = {
  environment: 'production',
  blockFailedPriorities: ['P0', 'P1'],
  blockInsufficientExplicitPriorities: ['P0', 'P1'],
  blockCheckErrors: true,
  blockConflicts: true,
};

export const DEFAULT_STAGING_POLICY: ReleasePolicy = {
  environment: 'staging',
  blockFailedPriorities: ['P0'],
  blockInsufficientExplicitPriorities: ['P0'],
  blockCheckErrors: true,
  blockConflicts: true,
};
