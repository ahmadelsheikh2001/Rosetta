# ADR-002: Separate Source Model, IR and Target Model

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Vendor formats change (A360 package versions, Studio versions). If parsers emit IR directly, every format change leaks into conversion logic.

## Decision

Three models:

1. **Source Model**: typed mirror of the export as-is, validated with Zod.
2. **IR**: vendor-neutral (`packages/ir`, see `docs/ir.md`).
3. **Target Model** (WAL Model): printed to text.

Parsers produce the Source Model, lifters produce IR, lowerers produce the Target Model, printers produce text.

## Consequences

Format churn stays inside `source-*` / `target-*` packages. Costs an extra model per platform, which we accept.
