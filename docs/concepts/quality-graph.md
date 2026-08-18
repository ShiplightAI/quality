# The quality graph

The quality graph is a written map from what your product must deliver to the
latest results that can show whether those expectations hold.

## Why it exists

A green test suite tells you that the tests which ran passed. It does not tell
you whether an important expected behavior has no test, whether a result failed
to reach the reporting system, or whether the team agrees that the right things
are being tested.

Quality starts by mapping product intent into features and expected behaviors
that a person can validate. It then connects each behavior to verification
methods and, when available, to observations or other results. Missing links
stay visible as evidence gaps even when every existing test is green.

## The five layers

```text
project          what you are assessing
  └── features         the capabilities it provides
        └── checks           the expected behaviors each capability must keep
              └── verification methods  how each behavior is evaluated
                    └── runtime observations  what executable methods reported
```

Read the graph from top to bottom:

1. **Project:** What are we assessing? Today, one repository contains one
   Quality project.
2. **Feature:** Which user-facing or operational capabilities make up the
   project? “Checkout” is a feature; the `checkout/` folder is not.
3. **Check:** What must remain true about that feature? For example, “A customer
   is never charged twice for one order.”
4. **Verification method:** How can we evaluate whether the check holds? This
   may be reasoning-based, such as static analysis, or empirical, such as a unit
   test, browser test, monitoring signal, or manual runtime procedure.
5. **Runtime observation:** What did an executable method report? This
   standardized result record can carry an empirical observation or the status
   of an executable reasoning tool.

Each layer can have a different problem. A check may have no verification
method. A method may exist but have no matching evidence or result. A passing
observation may support a list of checks that nobody has validated against
product intent. Keeping those cases separate makes the next action clearer.

Validation and verification answer different questions. Validation connects
product intent to the feature and check structure. Verification connects a
check to the implementation or observed behavior. See
[Correctness terminology](terminology.md) for the complete distinction.

## Where the graph is stored

Quality keeps its source files under `.quality/` in your repository. They can be
reviewed and versioned with the rest of the project.

| Information | Location |
| --- | --- |
| Project and feature list | `.quality/project-map.yaml` |
| Checks and verification methods for one feature | `.quality/evidence/<feature>/quality-map.yaml` |
| Saved scopes, result sources, and source lists | `.quality/config/` |

Tests, analyses, reports, workflows, and other verification artifacts stay in
their existing locations. The quality maps point to them; Quality does not move
or rewrite them.

You do not need to create these files by hand. A coding agent can prepare them,
but you remain responsible for validating product intent and approving decisions
such as accepted risk.

## Why features are not folders

A feature is a capability that can be understood and assessed on its own.
“Password reset” is a feature. “Utilities” is a code organization choice.

This distinction matters because the graph is meant to support a release
decision. A list of folders says little about user impact. A list of capabilities
with their expected behaviors, mapped methods, evidence, and gaps shows where
the risk is.

A useful test is: **if this failed, can I explain what would be broken for a user
or operator?** If not, it may not be a feature.

## Views, observation sets, and assessments

These terms describe different kinds of scope:

- A **view** selects the features to include, such as “the CLI release.”
- An **observation set** selects the places runtime results come from, such as
  the main CI workflow and a release smoke test.
- An **assessment** combines a feature scope, an observation set, and a specific
  revision or run to produce one result.

Views and observation sets are independent. You can assess the same features
against different result sources, or use the same results for different feature
views. A view selects features; it does not copy or change them.

## What the graph is not

The graph is not a test report. A report says what ran; the graph says what
matters and how the available evidence relates to it.

The graph is also not a score. The [four scores](the-four-scores.md) are readouts
calculated from the graph and, for runtime quality, from observations. You
improve the underlying intent, checks, verification methods, software, evidence,
or validation—not the number directly.
