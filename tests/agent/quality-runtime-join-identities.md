# Agent test: runtime join identities

## Purpose

Verify that feature mapping and observation wiring use reporter-emitted
identities and prevent project-wide pinned/unpinned overlap.

## Fixture

Use a test runner whose native report emits nested case names that differ from
the leaf labels in source. Map the same test file from two feature maps, with one
existing file-level evidence row and one proposed case-level row. Include one
proposed evidence path that points to a file where the named test does not exist.
Also include a CI workflow step and a manual-check heading for which no canonical
observation has been emitted.

## Verification

1. `/quality map-feature` converts or reads a representative native report and
   uses the exact emitted `path` + `test_case`; it does not shorten the case to a
   source-code leaf label.
2. It detects the wrong evidence path before claiming validation success.
3. It searches all feature maps and reports the pinned/unpinned strategy
   conflict for the shared path.
4. It does not turn the visible CI step or manual-check heading into a
   `test_case` pin without an existing canonical observation; it leaves the row
   file-level and records the runtime-emission gap.
   A claim that the label matches its source text does not pass this check; the
   result must identify the canonical record used to establish the join key.
5. `/quality improve` does not call observation wiring complete while intended
   mapped proof is unmatched or observations are ambiguous.
6. Any mechanical repair preserves check meaning, proof behavior, and
   human-owned fields.
