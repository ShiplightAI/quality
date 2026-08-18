# Accept a known gap

**Outcome:** A specific gap remains visible but no longer appears as open work.

**Use this when:** The gap is real, the team understands the consequence, and
living with it is an explicit decision—for example, relying on a manual release
check for a low-use internal screen.

Acceptance records risk; it does not add evidence or change a test result.

## Ask your agent

Name the check and the gap category you are accepting:

```text
We accept the missing end-to-end verification on the admin export check as
tolerated risk. Add the "missing" category to that check's accepted gaps.
```

To reverse the decision:

```text
We no longer accept the "missing" gap on the admin export check. Remove that
category from its accepted gaps.
```

## What the agent does

The agent adds or removes one category in the check's `accepted_gaps` list. The
underlying status and mapped verification methods remain unchanged, so readers
can still see what is missing.

The current file format stores the accepted category but does **not** have a
dedicated field for the reason, owner, or expiry date. Record that context in
the pull request or your normal risk register. Do not assume Quality preserved a
rationale that the file cannot store.

## What changes

| Accepted category | Effect |
| --- | --- |
| `missing`, `manual-only`, or `weak` | The gap stops counting as open, and its structural coverage/static-quality penalty is removed. |
| `stale`, `deferred`, `failing`, or `unavailable` | The gap stops counting as open; the scores do not change. |

In every case:

- Evidence confidence is unchanged.
- Structure confidence is unchanged.
- Runtime quality is unchanged. A failed test remains failed, and an unobserved
  check remains unobserved.

## Decision that remains yours

Only a person can accept risk. An agent may identify a possible candidate, but
it must not write `accepted_gaps` until you explicitly name the decision.

Before accepting, ask:

- What could happen if this gap matters?
- Who owns the consequence?
- Is the reason temporary, and when should it be reviewed?
- Where will that rationale be recorded?

## Verify the result

- The gap is still visible and marked accepted.
- Only the category you named was added.
- Evidence and runtime status did not change.
- If the category was `missing`, `manual-only`, or `weak`, structural coverage
  may improve; otherwise, a score change would be unexpected.
- The rationale exists in the pull request or risk system if your process
  requires one.

## Troubleshooting

**You wanted the gap fixed.** Remove the acceptance and follow
[Act on a low score](act-on-a-weak-score.md).

**Accepted risks are accumulating.** Review whether the list of checks is wrong,
whether verification investment is being postponed indefinitely, or whether
accepted decisions need an expiry process outside Quality.

**The score did not change.** That is expected for state categories such as
`stale` or `failing`. Acceptance changes open-gap reporting, not the observed
software result.
