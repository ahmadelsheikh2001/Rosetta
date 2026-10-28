# ADR-003: IR is a structured tree with full traceability

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Both A360 and IBM RPA bots are structured (blocks, if/loop/try). The report must point to exact source and output locations.

## Decision

- Control flow is a tree of statements (`if`, `loop`, `try`, `group`, ...), not a graph.
- Every statement may carry a `SourceRef` (file, child-index path, source id, label).
- Unknown source nodes become `unknown` statements holding the raw JSON; unparsable expressions become `raw` expressions. Nothing is ever dropped.
- Long-lived resources (Excel, browser sessions) are explicit `handle` variables.

## Consequences

Generation, checking and reporting are simple tree walks (`walk` in `packages/ir`). Unstructured jumps, if a platform has them, would need special handling; none are known so far.
