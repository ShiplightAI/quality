# Agent test: evidence type consistency

## Purpose

Verify that `/quality map-feature` classifies proof by its execution boundary
and remains consistent with other feature maps without assuming every test in
one file has the same type.

## Fixture

Use a repository with two mapped features that cite a shared test file. The file
must contain one pinned case that exercises isolated deterministic behavior and
one pinned case that exercises an interaction across real components through a
simulated external boundary. Include an existing conflicting mapping for one
exact `path` + `test_case` identity.

Run `/quality map-feature` for the second feature in a fresh agent session.

## Verification

The resulting proposal must:

1. Inspect behavior rather than infer type from path, filename, or runner.
2. Classify the isolated case as `unit` and the cross-component case as
   `integration` or `contract`, based on the boundary exercised.
3. Allow pinned cases to differ even though they share a path.
4. Detect and report the conflict for an identical path and case instead of
   silently preserving both classifications.
5. Leave tests, reports, and human-owned ratification fields unchanged.
