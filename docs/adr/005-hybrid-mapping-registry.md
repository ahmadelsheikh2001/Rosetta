# ADR-005: Hybrid, data-driven mapping registry

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Simple renames fit a table; one-to-many mappings, expression rewriting and session handling do not.

## Decision

- One YAML entry per source command (`packages/mappings/registry/`), validated by a Zod schema, with a `status`: `planned`, `partial`, `mapped` or `unsupported`.
- An entry may name a TypeScript **handler** for logic a table cannot express.
- A **registry meta-test** fails the build when a `partial`/`mapped` entry has no fixture, a handler has no unit test, or an entry references a missing handler.

## Consequences

Coverage can be computed from the registry alone, which Assessment uses before any generator exists. Other developers extend coverage without touching the core (see CONTRIBUTING).
