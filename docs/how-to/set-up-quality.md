# Set up Quality

**Outcome:** A first, reviewable map of your project, its features, the expected
behaviors one feature must keep, and the proof already available.

**Use this when:** You are introducing Quality to a repository. It works with a
detailed specification, with existing code and tests, or with a partially built
Quality graph.

## Ask your agent

```text
/quality start
```

If you already know where the greatest risk is, name it:

```text
/quality start, focus on billing first
```

## What happens

The agent will:

1. Read the project's requirements, documentation, code, tests, CI, and any
   existing `.quality/` files.
2. Explain what parts of the quality graph already exist and what is missing.
3. Propose a small set of product capabilities as features.
4. Map one high-priority feature first, including its checks, existing proof,
   and honest gaps.
5. Report the structural scores and, if runtime results are already connected,
   the runtime quality score.

The agent maps existing proof. It does not create tests or change how a test
decides pass or fail. If connecting existing CI results requires a workflow
edit, it must ask for explicit permission first.

## Decisions that remain yours

The first map is a proposal. You decide:

- Whether the proposed features are real product capabilities.
- Which features and checks matter most.
- Whether the recorded origin of each check is accurate.
- Whether the complete list of checks is correct and ready for approval.
- Whether any known gap is acceptable.

An agent-generated or code-inferred map normally begins with less than full
structure confidence. That is useful information, not a setup failure. See
[Review and approve the graph](review-and-ratify.md).

## Verify the result

- `.quality/project-map.yaml` exists and describes recognizable product
  capabilities rather than folders or packages.
- At least one feature has a quality map under `.quality/evidence/`.
- Its checks make sense without requiring the reader to know function names.
- Existing proof is connected where possible and missing proof is shown as a
  gap.
- Any unavailable score includes an explanation.

The runtime quality score is often unavailable on the first pass because no
observation set has been run. If this repository already had compatible runtime
configuration and results, the agent may be able to calculate it immediately.

Ask for a read-only summary at any time:

```text
/quality status
```

## Troubleshooting

**The features look like folders.** Ask the agent to group the project around
capabilities and user outcomes instead of the code layout.

**There are too many features.** Ask for fewer, broader capabilities that could
each be explained to a customer or operator.

**Priorities are unknown.** The repository did not provide a trustworthy basis
for them. Supply the priorities you want the project to use; do not ask the
agent to invent certainty.

**Runtime quality is unavailable.** No usable observation set has been loaded.
Continue with [Make CI results count](make-ci-results-count.md).

## Next steps

1. [Review and approve the first feature](review-and-ratify.md).
2. [Connect CI results](make-ci-results-count.md).
3. [Map the next important feature](map-a-feature.md).
