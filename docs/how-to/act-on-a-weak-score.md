# Act on a low score

**Outcome:** The low score is traced to its actual cause before anything is
changed.

**Use this when:** A score is weaker than expected, especially before assuming
that the answer is simply to write more tests.

## Ask your agent

```text
Our coverage score is low. Diagnose the causes and recommend the smallest
honest improvement.
```

For one area:

```text
Why is evidence confidence low for the payments feature?
```

## Start with the score that is low

| Score | What a low value can mean | What usually helps |
| --- | --- | --- |
| **Quality** | Checks failed, errored, were skipped, have mixed results, or have no matching observation | Fix the behavior or proof pipeline, then rerun it |
| **Coverage** | Proof is missing, manual, indirect, incomplete, or below a declared policy | Connect or add the appropriate proof and resolve the recorded gap |
| **Evidence confidence** | Proof is absent, non-automated, single-layer, ungated, or constrained by an unmet policy | Use an appropriate automated method, meaningful second method, or delivery gate |
| **Structure confidence** | Check origin is weak or undeclared, or the complete list has not been approved for a confirmed feature | Correct the recorded origin and ask a person to review the list |

Do not average these explanations. A passing runtime result does not repair a
coverage gap, and stronger proof does not approve the product promises.

## Separate missing proof from missing results

Two problems can both produce an unobserved runtime check:

- **No proof is mapped.** Coverage is also weak. The fix is to identify or create
  appropriate proof and connect it to the check.
- **Proof is mapped but no result matched it.** Coverage may look healthy, while
  runtime quality is weak. The fix is the result pipeline or the path/test-case
  join—not another test.

Ask for the resolution audit before creating new proof:

```text
For each unobserved check, tell me whether proof is missing or whether a result
failed to match. Show the resolution audit.
```

See [Make CI results count](make-ci-results-count.md) when results are not
reaching the graph.

## Decisions that remain yours

- Whether a promise belongs in the graph at all.
- Whether a proof policy reflects the risk correctly.
- Whether the list of checks is complete and approved.
- Whether a known gap is acceptable.

Removing a real promise or narrowing a release view solely to raise a score
hides risk rather than resolving it.

## Verify the improvement

- The cause was identified before files changed.
- The change addresses that cause directly.
- The assessment uses the same feature view, observation set, and revision as
  the earlier result.
- A before-and-after comparison explains what changed beneath the number.

## Troubleshooting

**The number rose but the underlying condition did not improve.** Check whether
scope was removed, proof was mislabeled, a policy was weakened, or risk was
accepted only to clear a warning. Restore the honest input and treat unexpected
score movement as a defect.

**More tests did not help.** Confirm that their paths and optional test-case
names match the quality map and that the selected observation set actually loads
their results.

**Structure confidence remains low.** Recording a truthful origin can help, but
an agent cannot provide human approval. Review the feature and its complete
list of checks yourself.
