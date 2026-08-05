# Who decides what

An agent can investigate, prepare, and recommend. A person remains responsible
for decisions about product intent, priority, approval, and accepted risk.

## Why the roles are separate

An agent may write code and tests. If the same agent can also declare its own
work correct and approve the standard it is measured against, the result is
self-assessment rather than independent review.

Quality separates those roles. Proof producers report facts and results. The
deterministic engine evaluates them. People approve the product model and any
risk they choose to tolerate.

## What an agent can do

An agent can:

- Read the repository and propose its features.
- Draft checks for each feature.
- Find existing proof and connect it to those checks.
- Report gaps and recommend next steps.
- Configure authorized, mechanical collection of existing test results.
- Suggest a stronger proof requirement or identify a possible accepted risk.

These are proposals, observations, and implementation tasks. They are not human
approval.

## Decisions that remain yours

| Decision | What you are confirming |
| --- | --- |
| **Feature boundary** | This is a real product capability, not merely a folder or implementation detail. |
| **Priority** | This importance level reflects what the team would protect or block a release for. |
| **Origin** | The recorded source of the checks is truthful: specification, person, agent draft, or inference from code. |
| **Check-list approval** | You reviewed the complete list and agree these are the right promises. |
| **Proof requirement** | This promise needs a particular method, context, or delivery gate. |
| **Accepted risk** | The team understands this gap and chooses to tolerate it. |

An agent may record one of these decisions after you state it explicitly. It
must not infer approval from silence, a passing test, or its own confidence.

## How structure confidence actually changes

Structure confidence uses two kinds of information:

1. **Origin.** Checks from a specification or a person receive more confidence
   than agent-generated checks, checks inferred from existing code, or checks
   with no recorded source.
2. **Review.** When the feature is confirmed and a person approves its complete
   list of checks, all checks in that feature receive full structure confidence.

The original source remains visible after approval. An agent-drafted list can be
human-approved without being relabeled as human-authored.

Feature priority affects how heavily a check counts in all aggregate scores.
Recording that a priority came from a person is important governance data, but
the current engine does not add separate structure-confidence points for that
field.

## Raising and lowering the proof bar

Two decisions affect structural assessment without changing structure
confidence:

- **Require stronger proof.** You can require a check to use a particular method
  or run in a delivery gate. Until the requirement is met, structural coverage
  and evidence confidence may fall. An existing runtime result is unchanged.
- **Accept a known gap.** You can mark a specific gap category as tolerated.
  The gap remains visible but stops counting as open. Only the evidence-strength
  categories `missing`, `manual-only`, and `weak` remove a structural score
  penalty when accepted.

An agent may make a proof requirement stricter because doing so cannot create
false confidence. It must not weaken your requirement or accept risk for you.

## What review looks like in practice

You are not being asked to review every line of code. You are answering higher
level questions:

- Are these real features?
- Are these the right promises to make to users and operators?
- Is anything important missing?
- Does the priority match the consequence of failure?
- Is an accepted risk genuinely understood and tolerable?

See [Review and approve the graph](../how-to/review-and-ratify.md) for a practical
workflow.
