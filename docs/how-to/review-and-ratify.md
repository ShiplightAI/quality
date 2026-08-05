# Review and approve the graph

**Outcome:** Agent proposals become explicit human decisions, with their origins
and approvals recorded separately.

**Use this when:** A project or feature has been mapped and is waiting for your
review.

## Ask your agent

Start by asking for the outstanding decisions:

```text
Show me the Quality features, priorities, and lists of checks that still need a
person's decision. Put the highest-priority items first.
```

Then respond in ordinary language. For example:

```text
Feature 001 is a real capability and its priority is P0. I have read and
approve the complete list of checks for 001.
```

Disagreement is equally useful:

```text
Feature 002 is a folder, not a product capability. Merge it into 001. The third
check on 001 describes a test rather than a customer promise; rewrite it for
review.
```

## What the agent does

The agent shows the proposed decisions and records only the ones you state. It
keeps two facts separate:

- Where a feature or check originally came from.
- Whether a person later reviewed and approved it.

An agent-drafted check remains recorded as agent-drafted after approval. That
history is useful and must not be rewritten as human authorship.

## Decisions that remain yours

| Decision | Question to answer |
| --- | --- |
| Confirm the feature | Is this a genuine capability of the product? |
| Set the priority | How serious would failure be for users or a release? |
| Confirm the origin | Did these checks come from a specification, a person, an agent, or an inference from code? |
| Approve the checks | Are these the right promises, and is anything important missing? |

### What to look for

You are not reviewing implementation details. Ask whether the checks describe
the behavior the product must preserve.

- **A test description instead of a promise:** “The parser handles null input”
  describes implementation. “A malformed upload is rejected without damaging
  the existing record” describes an outcome.
- **A missing promise:** Add contractual commitments, past incident lessons, or
  fragile behavior the repository could not reveal.
- **Unhelpful priorities:** A list in which everything has the same priority
  does not identify what matters most.
- **An inaccurate origin:** Human approval does not turn an agent-generated
  check into a human-authored check.

## How approval affects scores

The recorded origin contributes to structure confidence immediately. Separately,
approving the complete list of checks gives every check full structure confidence
when the feature is also confirmed.

Priority affects how heavily checks count in all aggregate scores. The
`priority_provenance` record protects a human-set priority from being overwritten,
but the current engine does not award separate structure-confidence points for
that field.

## Verify the result

- The feature is no longer marked as a candidate if you confirmed it.
- The approved quality map records that the complete list of checks was reviewed.
- The original check provenance is unchanged.
- Structure confidence reaches full credit for that feature only when feature
  confirmation and approval of the complete list are both present.
- Nothing you did not explicitly approve was marked approved.

## Troubleshooting

**Approval did not lift the checks to full structure confidence.** Confirm both
requirements: the feature must not still be a candidate, and the complete list
of checks must be marked reviewed.

**The list is too long.** Review one high-priority feature at a time. A smaller
area with deliberate approval is more useful than a project-wide skim.

**Most of the proposal is wrong.** Ask the agent to revise it. Finding that the
model misunderstood the product is exactly what this review is designed to do.
