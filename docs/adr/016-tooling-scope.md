# ADR-016: Tooling scope for Phase 0 and Phase 1

- **Status:** Accepted (partly deferred)
- **Date:** 2026-10-28

## Context

Tooling should stay pragmatic until the first demo.

## Decision

In place now: TypeScript project references, ESLint (typescript-eslint strict, type-checked) with Prettier, Vitest, commitlint with husky (conventional commits), and the registry meta-test.

**Deferred until after the Phase 1 demo** (tracked here so they are not forgotten):

- **dependency-cruiser**, to enforce layer direction beyond what project references catch.
- **Changesets** (or conventional-changelog), for automated CHANGELOG and versioning. CHANGELOG is maintained by hand until then.
- **Dependency license check**, e.g. rejecting GPL.
- **CI pipeline**, blocked on the source-control platform choice.

## Consequences

Lower setup cost now. The deferred items are also listed under "Planned" in the CHANGELOG.
