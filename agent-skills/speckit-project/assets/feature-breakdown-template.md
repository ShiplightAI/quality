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
- Spec/code/test drift must be reconciled or clarified with the user.
- Work on one active feature at a time.
- Use stable feature IDs; do not renumber without explicit approval.

## Roadmap

### 001 - <Feature Name>

Goal: <Product outcome or workflow promise>

PRD coverage:

- <PRD area or requirement>

Primary outputs:

- <Spec, UI, API, data, or workflow artifact>

Quality focus:

- <Testing and verification expectations>

Dependencies: none.

### 002 - <Feature Name>

Goal: <Product outcome or workflow promise>

PRD coverage:

- <PRD area or requirement>

Primary outputs:

- <Spec, UI, API, data, or workflow artifact>

Quality focus:

- <Testing and verification expectations>

Dependencies: 001.

## MVP Boundary

The MVP is complete when:

- <Feature/capability exit criterion>

## Release Notes

- <Important sequencing, migration, compatibility, or deferred-scope note>
