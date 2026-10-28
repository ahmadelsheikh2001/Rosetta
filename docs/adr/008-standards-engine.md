# ADR-008: Standards engine with profiles and three transform categories

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Generated bots must look like the work of a senior IBM RPA developer, while business behaviour (including error paths) stays identical to the source.

## Decision

- A **standards profile** (schema in `packages/standards`, documented in `docs/standards-profile.md`) holds naming, header, config, logging, error, quality and sizing rules.
- Layering order: built-in defaults → company → client → project overrides (ADR-009).
- Every transform declares exactly one category:
  - **Structural**: always applied; cannot change behaviour (header, comments, Step groups, naming, step-boundary logging).
  - **Guarded**: applied only when a static check proves it safe, otherwise downgraded to a recommendation (cleanup blocks, config extraction, stage split, transparent error wrappers).
  - **Behavioral**: never applied silently; reported as a recommendation, or applied only under an explicit opt-in flag (retries, Delay → wait, error-flow changes).
- When a standard conflicts with source behaviour, **source behaviour wins** and a `standards-conflict` diagnostic is raised.
- A **Source Checker** (on the IR of the source bot) and an **Output Checker** (on the generated output) report quality violations.

## Consequences

Clients can impose their own conventions without code changes. A test must assert that no behavioral transform runs without its flag.
