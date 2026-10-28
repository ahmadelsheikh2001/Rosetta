# ADR-017: Evidence-based file formats

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A360 export JSON and IBM RPA WAL syntax must not be assumed from memory.

## Decision

- Every format assumption lives in [`docs/assumptions.md`](../assumptions.md) with a status (Open / Verified / Refuted) and a pointer to evidence (a corpus file or a probe-script result).
- No WAL command name and no A360 field name goes into code or the registry until its assumption is Verified.
- Verified format knowledge is documented in [`docs/formats/`](../formats/).

## Consequences

A slower start, but far fewer wrong turns. Phase 0 cannot finish until the A360 export assumptions Phase 1 depends on are resolved.
