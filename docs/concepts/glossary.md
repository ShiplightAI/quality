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

**Check** — A promise that must remain true, such as “A customer is never
charged twice for one order.” Quality map files call checks *expectations*.

**Proof** — An artifact that can support a check: a test, workflow gate,
monitoring signal, static check, or manual procedure. Quality map files call
proof *evidence*.

**Observation** — A recorded outcome from one piece of proof: passed, failed,
errored, or skipped.

**Proof gap** — A recorded explanation that proof is missing, incomplete, or
not yet available, often with a suggested next step.

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

**Approve or ratify** — For a person to confirm an agent proposal. Human review
can lift structure confidence when the feature is confirmed and its complete
list of checks is approved.

**Provenance** — The recorded origin of a list of checks or an individual check: a
specification, a person, an agent draft, an inference from existing code, or no
declared source. Provenance affects structure confidence and is not overwritten
when someone later approves the checks.

**Proof policy** — A requirement that one check needs particular proof, a
specific runtime context, or a delivery gate. An unmet policy can lower coverage,
evidence confidence, and the static quality readout; it does not rewrite a
runtime result that already occurred.

**Accepted risk** — A gap category that a person has explicitly chosen to
tolerate. The gap remains visible but no longer counts as open. Accepting a
`missing`, `manual-only`, or `weak` gap also removes that structural scoring
penalty. Other accepted categories change gap reporting only.

## Kinds of proof

Quality recognizes these proof types:

`unit`, `contract`, `integration`, `e2e`, `agent`, `manual`, `telemetry`,
`static`, `smoke`, `script`, and `other`.

The type describes what the artifact actually is. The engine uses that fact,
along with runtime context and declared proof requirements, to derive evidence
confidence. Priority—not proof type—determines how heavily a check counts in an
aggregate score.

## Kinds of gap

Open gaps use these categories:

`missing`, `blocked`, `stale`, `deferred`, `manual-only`, `weak`, `failing`, and
`unavailable`.

The distinction matters:

- **Missing** means no proof is mapped.
- **Unavailable** means proof is described but does not provide a usable path,
  URL, or command. A mapped proof item with no matching runtime result is
  **unobserved**, which is a runtime state rather than a gap category.
- **Failing** means the available result reported a failure.

Those conditions require different responses, even when they all deserve
attention.
