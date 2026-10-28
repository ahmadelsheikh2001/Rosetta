# ADR-004: Canonical action vocabulary with vendor passthrough

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

"One parser and one generator per platform" only holds if the IR has a vendor-neutral vocabulary of actions.

## Decision

Actions use canonical op names `<family>.<verb>` (e.g. `excel.open`). Commands without a canonical op yet are kept as `vendor:<platform>/<package>/<command>`, so conversion never stalls. The vocabulary grows from real corpus usage, family by family.

## Consequences

Designing the vocabulary is ongoing work. Vendor ops are always reported as needing manual review.
