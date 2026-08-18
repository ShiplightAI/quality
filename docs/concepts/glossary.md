# Glossary

Quality uses a small set of terms consistently. In conversation you can use
ordinary language; this page helps when a report or screen uses a precise term.

## What is being assessed

**Repository** — The folder that contains the project and its `.quality/`
files.

**Project** — The overall assessment boundary. Quality currently supports one
project per repository.

**Feature** — A capability that can be understood and checked on its own, such
as “password reset.” A feature is not a folder, file, or ticket.

**Product** — Plain-language context about what the project delivers. Product
descriptions help people understand the graph but do not change scoring.

## What is in the graph

**Check** — An expected behavior that must remain true, such as “A customer is
never charged twice for one order.” Quality map files call checks
*expectations*.

**Validation** — Comparing proposed features and checks with product intent to
confirm that they describe the right requirements and expected behaviors.

**Verification** — Evaluating whether the implementation or observed behavior
satisfies a quality check. Verification may be reasoning-based or empirical.

**Verification method** — A method or artifact used to evaluate a check, such
as a test, formal analysis, workflow gate, monitoring signal, static check, or
manual procedure. Quality map files store these mappings under `evidence`.

**Evidence** — Information that supports or challenges a check. Evidence may
come from reasoning or from an observation evaluated against an expected
outcome.

**Observation** — A recorded fact or outcome. An observation becomes
verification evidence only when it is connected to a check and evaluated
against the expected outcome.

**Empirical observation** — A recorded fact about executed or production
behavior that empirical verification compares with a quality check.

**Runtime observation** — Quality's standardized record that an executable
verification method passed, failed, errored, or was skipped at a particular
revision and time. It may transport the outcome of either an empirical method
or an executable reasoning tool.

**Evidence gap** — A recorded explanation that evidence is missing, incomplete,
or not yet available, often with a suggested next step. The current quality-map
field is named `proof_gap` for compatibility.

**Proof** — A deductive argument that establishes a proposition under stated
assumptions, including a machine-checked formal proof. Quality does not use
*proof* as a general synonym for tests or evidence.

## Scope and timing

**View** — A saved list of features to assess together, such as “the CLI.” A
view changes feature scope only; it does not choose result sources.

**Observation source** — One place standardized runtime results can be loaded
from, currently a GitHub Actions workflow or a local folder.

**Observation set** — A saved group of observation sources that are assessed
together. It changes result sources only; it does not choose features.

**Assessment** — One result produced from a whole project or saved view, an
observation set, and the selected revision or run.

**Release candidate** — The concrete build, commit, version, or artifact covered
by an assessment.

## Trust and decisions

**Validate intent** — For a person to confirm that proposed features and checks
accurately represent the product intent. Human validation can lift structure
confidence when the feature and its complete list of checks are confirmed.

**Provenance** — The recorded origin of a list of checks or an individual check: a
specification, a person, an agent draft, an inference from existing code, or no
declared source. Provenance affects structure confidence and is not overwritten
when someone later validates the checks.

**Verification policy** — A requirement that one check needs a particular
verification method, runtime context, or delivery gate. An unmet policy can
lower coverage, evidence confidence, and the static quality readout; it does not
rewrite a runtime result that already occurred.

**Accepted risk** — A gap category that a person has explicitly chosen to
tolerate. The gap remains visible but no longer counts as open. Accepting a
`missing`, `manual-only`, or `weak` gap also removes that structural scoring
penalty. Other accepted categories change gap reporting only.

## Kinds of verification method

The current quality-map schema recognizes these `evidence.type` values:

`unit`, `contract`, `integration`, `e2e`, `agent`, `manual`, `telemetry`,
`static`, `smoke`, `script`, and `other`.

The type describes what the mapped method or artifact actually is. The engine
uses that fact, along with runtime context and declared verification
requirements, to derive evidence confidence. Priority—not method type—determines
how heavily a check counts in an aggregate score.

These values are a compatibility vocabulary rather than a complete taxonomy of
correctness methods. See [Correctness terminology](terminology.md) for the
reasoning and empirical branches.

## Kinds of gap

Open gaps use these categories:

`missing`, `stale`, `deferred`, `manual-only`, `weak`, `failing`, and
`unavailable`.

The distinction matters:

- **Missing** means no verification method is mapped.
- **Unavailable** means a method is described but does not provide a usable
  path, URL, or command. A mapped method with no matching runtime result is
  **unobserved**, which is a runtime state rather than a gap category.
- **Failing** means the available result reported a failure.

Those conditions require different responses, even when they all deserve
attention.
