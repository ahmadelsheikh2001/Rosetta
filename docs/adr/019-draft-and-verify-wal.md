# ADR-019: Draft-and-verify for WAL syntax

- **Status:** Accepted
- **Date:** 2026-10-29
- **Refines:** ADR-017

## Context

ADR-017 says no WAL syntax is used until verified. The plan was a probe script in Studio first,
then the generator. Writing a probe covering W-01..W-17 is slow for one person, and it tests
constructs one at a time rather than real converted bots.

## Decision

- The WAL generator (`packages/target-wal`) is written now as a **draft**, from general
  knowledge of WAL. All syntax decisions live in `syntax.ts` and `commands.ts`.
- Every generated line that depends on unverified syntax is listed in the bot's `.notes.md` with
  its assumption id (W-xx, A-19). Every generated script says DRAFT in its header.
- Constructs we know too little about are not guessed: they become `TODO [ROSETTA]` comments or
  visible `{{ROSETTA: …}}` placeholders, so the script still loads.
- The reviewer opens the generated scripts in IBM RPA Studio 30.0.2 and reports errors with the
  line number. Each answer updates the Assumptions Register (Verified / Refuted) and the draft.
- ADR-017 still holds: nothing is marked Verified without Studio evidence.

## Consequences

Faster feedback on real bots, at the cost of a few correction rounds. The generated golden WAL
files change as the syntax is corrected; each change is reviewed against Studio feedback.
