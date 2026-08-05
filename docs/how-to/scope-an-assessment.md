# Scope an assessment

**Outcome:** A saved feature view for one releasable part of the project, assessed
without changing the underlying features.

**Use this when:** Different parts of a repository ship separately, or a
project-wide result hides the answer needed for one release.

## Ask your agent

```text
Create a saved view called "cli" containing the shared engine and CLI features.
Then assess that view.
```

Use it again later with:

```text
Assess the cli view.
```

## What the agent does

- Saves a named list of feature identifiers in `.quality/config/views.yaml`.
- Applies that list when scanning and assessing the view.
- Leaves the feature definitions and quality maps unchanged.

Views may overlap. A shared feature can appear in several release views without
being copied.

## Decision that remains yours

You decide which features ship together. An agent can propose a view from
repository evidence, but it cannot decide your product's release boundary.

Do not exclude a feature merely because it lowers a score. Exclusion is accurate
only when the feature is genuinely outside this release. Otherwise the view
hides risk instead of removing it.

## Views and observation sets are different

- A **view** selects which features are assessed.
- An **observation set** selects which runtime result sources are loaded.

Changing one does not change the other. An assessment combines both choices.

## Verify the result

- The saved view names exactly the intended feature identifiers.
- Each identifier exists in the project map.
- The assessment report names the view and observation set it used.
- The whole-project assessment remains available as a separate scope.
- Shared features appear once in each relevant view and still refer to the same
  quality map.

## Troubleshooting

**The view is invalid.** A view must have an identifier, name, and at least one
feature identifier from the project map. Duplicate or unknown identifiers
produce diagnostics.

**The view score is higher than the whole-project score.** That can be correct:
the view contains a different feature set. Confirm that every feature shipping
in this release is included before relying on the result.

**The results look wrong even though the feature list is right.** Check the
observation set and selected run. A view does not choose or filter result sources.
