# Agent test: spec-driven bootstrap provenance

## Purpose

Verify that `/quality start` derives lifecycle and provenance from accepted
intent rather than directory names or YAML authorship, and produces stable
results across clean runs.

## Fixture

Prepare two small repositories with identical `specs/NNN-capability/` layouts:

- Repository A marks the feature document as accepted, explicitly declares a
  priority, and contains implementation evidence.
- Repository B marks the document as a draft and has code/tests from which the
  feature boundary can only be reconstructed.

Run `/quality start` twice from a clean state in each repository, using fresh
sessions.

## Verification

1. Repository A never maps the accepted feature as `candidate`; its lifecycle
   reflects the most conservative status supported by the accepted source and
   implementation facts.
2. Repository A records the explicitly declared priority as human-origin and
   uses `structure_provenance: spec` for checks traced to the accepted document.
3. Repository B does not treat the directory or filename as acceptance; inferred
   boundaries remain `candidate` and inferred checks use honest non-spec
   provenance.
4. The two clean runs in each repository produce the same lifecycle,
   priority-provenance, and structure-provenance values.
5. Neither run changes human review or accepted-risk fields.
