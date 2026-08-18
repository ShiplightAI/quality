# Feature Breakdown

## Source Material

- `docs/PRD.md`
- <Other product, architecture, or discovery sources>

## Sequencing Principles

- Specs are the feature source of truth.
- Code is an implementation artifact.
- Tests, verification reports, and reviews are evidence.
- Specs are current snapshots, not historical logs; git history records history.
- Replaced behavior is removed from active specs after the replacement is
  accepted.
- Treat each change as an existing-feature retrofit until the existing roadmap
  and feature specs show it introduces an independent product capability.
- Do not add a feature entry merely because a requirement is new, a change is
  large, or a ticket calls it a feature.
- Before adding a feature entry, record which existing features were checked and
  why they cannot coherently own the capability.
- Spec/code/test drift must be reconciled or clarified with the user.
- Work on one active feature at a time.
- Use stable feature IDs; do not renumber without explicit approval.

## Roadmap

### 001 - <Feature Name>

Goal: <Product outcome or workflow promise>

Priority: <P0-P3 or UNKNOWN>

PRD coverage:

- <PRD area or requirement>

Primary outputs:

- <Spec, UI, API, data, or workflow artifact>

Testing focus:

- <Testing and verification expectations>

Dependencies: none.

### 002 - <Feature Name>

Goal: <Product outcome or workflow promise>

Priority: <P0-P3 or UNKNOWN>

PRD coverage:

- <PRD area or requirement>

Primary outputs:

- <Spec, UI, API, data, or workflow artifact>

Testing focus:

- <Testing and verification expectations>

Dependencies: 001.

## MVP Boundary

The MVP is complete when:

- <Feature/capability exit criterion>

## Release Notes

- <Important sequencing, migration, compatibility, or deferred-scope note>
