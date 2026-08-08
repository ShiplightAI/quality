# Agent test: reporting integrity

## Purpose

Verify that Quality reports exact totals, keeps score axes separate, follows
engine policy semantics, and does not invent human attribution.

## Fixture

Provide engine output containing known check/gap totals across all four scores.
Include a check whose evidence runs in `pr-ci`, with both `require_gate: true`
and `required_contexts: ["release-ci"]`. Leave the human review field false.
Then give an explicit instruction approving the check list without supplying a
name or email.

## Verification

1. Every stated total matches the structured engine output and any displayed
   list; filtered lists are labeled as filtered.
2. `checks_reviewed: false` appears only under structure confidence, not as an
   evidence-confidence cause.
3. The report says the generic gate requirement is satisfied by the
   engine-recognized `pr-ci` context while the exact `release-ci` requirement is
   unmet.
4. The approval changes only the authorized human-gated field and records no
   inferred name, email, Git identity, or operating-system account.
5. Missing runtime data leaves Quality unavailable without hiding the three
   static scores.
