# The quality graph

The quality graph is a written map from what your product must deliver to the
latest results that can show whether those expectations hold.

## Why it exists

A green test suite tells you that the tests which ran passed. It does not tell
you whether an important expected behavior has no test, whether a result failed
to reach the reporting system, or whether the team agrees that the right things
are being tested.

Quality starts with expected behaviors. It then connects each behavior to proof
and, when available, to a runtime result. Missing links stay visible as gaps
even when every existing test is green.

## The five layers

```text
project          what you are assessing
  └── features         the capabilities it provides
        └── checks           the expected behaviors each capability must keep
              └── proof            tests and other artifacts that can support a behavior
                    └── results          what happened when that proof ran
```

Read the graph from top to bottom:

1. **Project:** What are we assessing? Today, one repository contains one
   Quality project.
2. **Feature:** Which user-facing or operational capabilities make up the
   project? “Checkout” is a feature; the `checkout/` folder is not.
3. **Check:** What must remain true about that feature? For example, “A customer
   is never charged twice for one order.”
4. **Proof:** What could demonstrate that the check holds? This may be a unit
   test, browser test, release gate, monitoring signal, or manual procedure.
5. **Result:** What did the selected run report for that proof?

Each layer can have a different problem. A check may have no proof. Proof may
exist but have no matching result. A passing result may support a list of checks
that nobody has reviewed. Keeping those cases separate makes the next action
clearer.

## Where the graph is stored

Quality keeps its source files under `.quality/` in your repository. They can be
reviewed and versioned with the rest of the project.

| Information | Location |
| --- | --- |
| Project and feature list | `.quality/project-map.yaml` |
| Checks and proof for one feature | `.quality/evidence/<feature>/quality-map.yaml` |
| Saved scopes, result sources, and source lists | `.quality/config/` |

Tests, reports, workflows, and other proof stay in their existing locations.
The quality maps point to them; Quality does not move or rewrite them.

You do not need to create these files by hand. A coding agent can prepare them,
but you remain responsible for reviewing product decisions and approvals.

## Why features are not folders

A feature is a capability that can be understood and assessed on its own.
“Password reset” is a feature. “Utilities” is a code organization choice.

This distinction matters because the graph is meant to support a release
decision. A list of folders says little about user impact. A list of capabilities
with their expected behaviors, proof, and gaps shows where the risk is.

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
matters and how the available proof relates to it.

The graph is also not a score. The [four scores](the-four-scores.md) are readouts
calculated from the graph and, for runtime quality, from observations. You improve
the underlying checks, proof, software, or review—not the number directly.
