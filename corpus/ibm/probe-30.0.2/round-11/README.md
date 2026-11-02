# Round 11: generated (tier 2) commands — to run in Studio 30.0.2

Status: **not run yet**. Generated 2026-11-02 by the tiered fallback (ADR-023) for every A360 command
that converts to a generated draft: 502 commands in `drafts-01.wal` … `drafts-06.wal`, ordered by how
often the command appears in the 27 top-downloaded Agentic App Store A360 bots (A-27).

All six scripts pass `checkWal` (0 errors). Values are synthetic (`probe_<attribute>`); session
handles are declared as String, so Studio may report a type mismatch on them: record it, that is
a finding too.

## How to run

1. Open each `drafts-NN.wal` in IBM RPA Studio 30.0.2 (paste into a new script). **Do not run it.**
2. Copy the Error List (line + message) into `RESULTS.md` here, one table per file.
3. Fill the `studio_result` column of `checklist.csv` (`ok`, or the error text) per A360 command.

## After the round

- `ok` commands: give the registry entry `status: partial`, a fixture, and (if the generated line
  needed a fix) a hand-written lowerer in `packages/target-wal/src/commands.ts`.
- Rejected parameters or values: fix the rule in the mapping dictionary and rebuild
  `packages/target-wal/data` with `scripts/build-wal-rules.py`.
