# Validate the graph

**Outcome:** A person confirms that proposed features and checks accurately
represent product intent, with their origins and validation recorded separately.

**Use this when:** A project or feature has been mapped and is waiting for your
review.

## Ask your agent

Start by asking for the outstanding decisions:

```text
Show me the Quality features, priorities, and lists of checks that still need a
person's decision. Put the highest-priority items first.
```

Then compare the proposal with the PRD, specification, and other accepted
product sources. Respond in ordinary language. For example:

```text
Feature 001 is a real capability and its priority is P0. I compared the complete
list of checks for 001 with the billing PRD. It accurately represents the
required behavior and nothing important is missing. Mark it reviewed.
```

Disagreement is equally useful:

```text
Feature 002 is a folder, not a product capability. Merge it into 001. The third
check on 001 describes a test rather than a customer-facing expected behavior;
rewrite it as an outcome and ask me to validate the revised list.
```

## What the agent does

The agent shows the proposed structure and records only the validations you
state. It keeps two facts separate:

- Where a feature or check originally came from.
- Whether a person later validated it against product intent.

An agent-drafted check remains recorded as agent-drafted after validation. That
history is useful and must not be rewritten as human authorship.

## Decisions that remain yours

| Decision | Question to answer |
| --- | --- |
| Confirm the feature | Is this a genuine capability of the product? |
| Set the priority | How serious would failure be for users or a release? |
| Confirm the origin | Did these checks come from a specification, a person, an agent, or an inference from code? |
| Validate the checks | Do these expected behaviors accurately and completely represent product intent? |

### What to look for

You are not reviewing implementation details. Ask whether the checks describe
the behavior the product must preserve.

- **A test description instead of an expected behavior:** “The parser handles null input”
  describes implementation. “A malformed upload is rejected without damaging
  the existing record” describes an outcome.
- **A missing expected behavior:** Add contractual commitments, past incident lessons, or
  fragile behavior the repository could not reveal.
- **Unhelpful priorities:** A list in which everything has the same priority
  does not identify what matters most.
- **An inaccurate origin:** Human validation does not turn an agent-generated
  check into a human-authored check.

## How validation affects scores

The recorded origin contributes to structure confidence immediately. Separately,
validating the complete list of checks gives every check full structure
confidence when the feature is also confirmed.

Priority affects how heavily checks count in all aggregate scores. The
`priority_provenance` record protects a human-set priority from being overwritten,
but the current engine does not award separate structure-confidence points for
that field.

## Verify the result

- The feature is no longer marked as a candidate if you confirmed it.
- The validated quality map records that the complete list of checks was reviewed
  (the `checks_reviewed` field).
- The original check provenance is unchanged.
- Structure confidence reaches full credit for that feature only when feature
  confirmation and validation of the complete list are both present.
- Nothing you did not explicitly validate was marked reviewed.

## Troubleshooting

**Validation did not lift the checks to full structure confidence.** Confirm both
requirements: the feature must not still be a candidate, and the complete list
of checks must be marked reviewed.

**The list is too long.** Review one high-priority feature at a time. A smaller
area with deliberate validation is more useful than a project-wide skim.

**Most of the proposal is wrong.** Ask the agent to revise it. Finding that the
model misunderstood the product is exactly what this review is designed to do.
