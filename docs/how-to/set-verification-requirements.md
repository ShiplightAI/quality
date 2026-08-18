# Set verification requirements

**Outcome:** One check is treated as incomplete until its verification methods
meet a standard you specify.

**Use this when:** An expected behavior is more important than its current
evidence justifies, especially for money, permissions, privacy, data integrity,
or failures that would be expensive and quiet.

## Ask your agent

Require a particular verification method:

```text
For the check "A customer is never charged twice for one order," require an
end-to-end test before the structural assessment treats it as covered.
```

Require a runtime context:

```text
That check must also run in our release pipeline, not only on a developer's
machine.
```

## What the agent does

The agent records a verification policy on that check. The policy can require:

- A delivery gate such as CI or release.
- One or more verification method types.
- One or more named runtime contexts.

Until the mapped methods meet the requirement, the check remains structurally
partial and the missing requirement appears in recommendations.

## Decision that remains yours

You own the verification standard and any later decision to weaken or remove
it. An agent may propose or add a stricter requirement because that cannot
manufacture confidence. It must not lower a requirement you set unless you
explicitly direct it to do so.

## How scores respond

If the check already met the requirement, no score changes. Otherwise:

- Coverage can fall because the mapped verification setup is now partial.
- Evidence confidence can fall from high to medium.
- The static quality readout in generated analysis can fall.
- Runtime quality does not change. The recorded test result still says what
  happened in that run.
- Structure confidence does not change.

A lower structural score after raising the bar is not a regression in the
software. It is a more demanding and more honest description of the available
evidence.

## Verify the result

- The named check contains the intended verification requirement.
- The assessment identifies exactly which requirement is unmet.
- No unrelated checks changed.
- The requirement is satisfied only by evidence with the required type or
  context.

You can ask:

```text
Does this check meet the verification requirement now? Show which evidence
satisfies each part.
```

## Troubleshooting

**Nothing changed.** The existing methods may already satisfy the new policy. Ask
the agent to show the matching evidence and context.

**You intended a team-wide standard.** Verification policies are attached to
individual checks. If the same rule belongs everywhere, document a team
verification standard and decide how it should be represented rather than
repeating an exception on every check.

**Runtime quality stayed the same.** That is expected. A verification policy
changes the structural assessment; it does not rewrite an observation that
already happened.
