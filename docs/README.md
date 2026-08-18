# Shiplight Quality guide

Shiplight Quality helps people validate that expected behaviors represent
product intent, then connects those behaviors to verification methods and the
evidence those methods produce. It shows what is covered, what is uncertain,
what happened in the latest runs, and which decisions still need a person.

You do not need to understand the YAML files or scoring formulas to use this
guide. Most tasks can be requested from a coding agent in plain language. The
agent prepares changes for review; the scoring engine calculates the results.

## Start here

If Quality is new to you, begin with [The quality graph](concepts/quality-graph.md).
It explains the model in a few minutes. Then follow
[Set up Quality](how-to/set-up-quality.md) for your first project.

## Understand the model

| Page | What you will learn |
| --- | --- |
| [Correctness terminology](concepts/terminology.md) | How validation, verification, evidence, observations, and proof differ |
| [The quality graph](concepts/quality-graph.md) | How expected behaviors connect to verification methods and results |
| [The four scores](concepts/the-four-scores.md) | What each score means and why the scores stay separate |
| [How Quality earns your trust](concepts/trust-boundaries.md) | The boundaries that keep evidence, scores, and human decisions independent |
| [Who decides what](concepts/who-decides-what.md) | Which work an agent can prepare and which decisions require you |
| [Glossary](concepts/glossary.md) | The terms used throughout Quality |

## Choose what you want to do

| I want to… | Read this |
| --- | --- |
| Start using Quality in a repository | [Set up Quality](how-to/set-up-quality.md) |
| Use requirements from Jira, Linear, or an external document | [Add product sources](how-to/add-product-sources.md) |
| Define what one feature must guarantee | [Map a feature](how-to/map-a-feature.md) |
| Validate an agent's proposal against product intent | [Validate the graph](how-to/validate-the-graph.md) |
| Connect CI test results | [Make CI results count](how-to/make-ci-results-count.md) |
| Require stronger evidence for an important expected behavior | [Set verification requirements](how-to/set-verification-requirements.md) |
| Record a risk we have chosen to accept | [Accept a known gap](how-to/accept-a-known-gap.md) |
| Assess only the features in one release | [Scope an assessment](how-to/scope-an-assessment.md) |
| Understand and improve a low score | [Act on a low score](how-to/act-on-a-weak-score.md) |
| Explore the project in a browser | [Use Quality Explorer](how-to/inspect-in-the-browser.md) |

## Command reference

[Commands](commands.md) lists the requests you can give an agent and the command
line tools available for automation or CI.

## How the guides work

The how-to pages give you a prompt to start with, explain what the agent will do,
identify decisions that remain yours, and show how to verify the result. Adapt
the prompts to your project; they are examples, not special syntax.

Changes to `.quality/` are normal repository changes. Review them in a pull
request just as you would review product requirements or CI configuration. An
agent may propose a feature, priority, check, or accepted risk, but it must not
record your validation or approval unless you explicitly give it.

## For contributors

This guide is for people using Quality. If you are changing Quality itself, see:

- [Contributing](../CONTRIBUTING.md) for local setup and repository checks.
- [Architecture](../ARCHITECTURE.md) for package boundaries and design rules.

Exact machine-readable formats are available through the `schema` command
described in [Commands](commands.md). Most users should let the agent prepare
those files and review the meaning rather than edit the format by hand.
