# Map a feature

**Outcome:** One capability gets a readable list of the expected behaviors it
must keep, the existing proof for each behavior, and the gaps that remain.

**Use this when:** After initial setup, when adding the next important feature,
or when a feature's responsibilities have changed.

## Ask your agent

If you know the feature identifier:

```text
/quality map-feature <feature-id>
```

Replace `<feature-id>` with an ID from `.quality/project-map.yaml`, such as
`002-recorder-session-upload`.

Or describe the feature:

```text
Map the feature responsible for recording uploads. Show what must remain true,
what proof already exists, and what is still missing.
```

## What the agent does

- Reads accepted specifications when available, then relevant code, tests, and
  CI configuration.
- Drafts checks in product language.
- Connects existing tests, workflows, and other proof.
- Records the source of the checks honestly.
- Records missing or inadequate proof instead of omitting the expected behavior.

The agent does not write tests during feature mapping. Creating missing proof is
a separate implementation task.

## Decisions that remain yours

**Whether the checks are right.** The first list is a proposal. Review it using
[Review and approve the graph](review-and-ratify.md).

**How important each check is.** When accepted source material provides a
priority, the map can use it. Otherwise the check should remain `UNKNOWN` until
you decide; an agent should not turn a guess into an asserted product priority.

## Verify the result

Read each check without looking at the code. It should describe an outcome that
still matters after implementation details change.

Good:

> A customer is never charged twice for one order.

Too implementation-specific:

> `chargeOnce()` is idempotent.

Also check:

- Are important failure modes represented?
- Does the list include lessons from past incidents or contractual commitments?
- Is every proof path real and repository-relative?
- Where a check names a specific test case, does that name match what the test
  reporter emits?
- Are gaps visible rather than hidden by a short list?

Checks participate in scoring before human approval; approval changes how much
structure confidence the list receives. Do not approve merely to make the graph
“start counting.”

## How runtime results connect

Quality joins a result to proof primarily through its file path and, when
present, an optional test-case name. Test-case matching ignores case and
surrounding whitespace; file paths may match as repository-relative suffixes.

Renaming a proof file can produce a missing-file scan warning. Renaming a pinned
test case can leave observations unmatched. Use the resolution audit when a
previously observed check becomes unobserved.

## Troubleshooting

**Every check has unknown priority.** No trusted source supplied priorities.
Ask the product owner or release owner to set them.

**The checks mirror test names.** The agent worked backward from implementation
instead of accepted intent. Explain the user or operational outcome, or
[add the real product sources](add-product-sources.md), then remap.

**Existing results do not connect.** Compare `evidence.path` and optional
`evidence.test_case` with the observation audit before creating new tests.

## Next steps

- [Review and approve the list of checks](review-and-ratify.md).
- [Act on the highest-value gap](act-on-a-weak-score.md).
