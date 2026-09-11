# `@shiplightai/quality-core`

Internal workspace package for deterministic scanning, assessment,
observations, recommendations, views, and Quality operations.

It depends on `@shiplightai/quality-map` and is bundled into the published CLI.

## Release intelligence

`@shiplightai/quality-core/release-intelligence` exposes the provider-neutral,
deterministic release assessment contract. It accepts immutable repository and
workflow evidence snapshots and returns behavior assessments and release-policy
decisions. Database persistence, tenant authorization, GitHub App access,
queues, and publish callbacks belong to the embedding host.

`@shiplightai/quality-core/release-intelligence/operations` contains the
server-side fact compiler. Like the Quality Center operations, it receives a
server-owned project path and a least-privilege environment from the host. It
does not resolve tenants, GitHub installations, or persistence itself.
