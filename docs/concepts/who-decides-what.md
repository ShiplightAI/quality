# Who decides what

An agent can investigate, prepare, and recommend. People remain responsible
for product intent, priority, approval, and accepted risk.

## What an agent can prepare

An agent may:

- propose features and priorities;
- draft checks in product language;
- connect existing proof and report gaps;
- configure authorized, mechanical result collection; and
- suggest a stronger proof requirement or a possible accepted risk.

These are proposals or implementation tasks, not human decisions.

## Decisions that remain yours

| Decision | What you confirm |
| --- | --- |
| Feature boundary | This is a product capability, not a folder or implementation detail. |
| Priority | The importance reflects what the team would protect or block a release for. |
| Origin | The recorded source of each check is truthful. |
| Check-list approval | The complete list of expected behaviors is correct and complete. |
| Proof requirement | A check needs a particular method, context, or delivery gate. |
| Accepted risk | The team understands and chooses to tolerate the gap. |

An agent may record a decision after you state it explicitly. It must not infer
approval from silence, passing tests, or its own confidence.

## How structure confidence changes

Structure confidence uses two inputs:

1. **Origin:** Checks from a specification or person receive more confidence
   than agent-generated checks, code inferences, or checks with no source.
2. **Review:** When a feature is confirmed and a person approves its complete
   list of checks, all checks in that feature receive full structure confidence.

The original source remains visible after approval. Feature priority affects
aggregate weighting; recording `priority_provenance: human` protects a human-set
priority but does not add separate structure-confidence points.

## Raising or lowering the proof bar

- **Require stronger proof:** A check may be required to use a particular method
  or delivery gate. Until met, structural coverage and evidence confidence may
  fall; existing runtime results do not change.
- **Accept a known gap:** A person may tolerate a specific gap category. The gap
  remains visible but stops counting as open. Only `missing`, `manual-only`, and
  `weak` remove a structural scoring penalty when accepted.

An agent may make a proof requirement stricter, but may not weaken it or accept
risk on your behalf.

## Questions for review

- Are these real product or operational capabilities?
- Are these the right expected behaviors to preserve?
- Is anything important missing?
- Does each priority match the consequence of failure?
- Is any accepted risk genuinely understood and tolerable?

See [Review and approve the graph](../how-to/review-and-ratify.md) for the
practical workflow.
