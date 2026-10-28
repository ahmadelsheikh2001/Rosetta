# ADR-011: One WAL script per source bot

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Mirroring the source structure keeps traceability simple; some small helper bots read better inlined.

## Decision

Each A360 bot becomes its own WAL script. _Run Task Bot_ becomes a call to that script with the same inputs and outputs. An option allows inlining small helper bots as subroutines.

## Consequences

Cross-bot renames must stay consistent, so naming is applied at project level. The exact WAL constructs are chosen after the probe script (ADR-017).
