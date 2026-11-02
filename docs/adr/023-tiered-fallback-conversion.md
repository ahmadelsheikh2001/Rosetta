# ADR-023: Tiered fallback conversion for every A360 command

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The hand-written lowerers cover the commands seen in the corpus (Studio-verified). A real portfolio
uses many more: 1,943 A360 commands are known (145 Control Room packages + Agentic App Store
packages, A-27). The owner needs every bot to convert end to end.

## Decision

A command with no hand-written lowerer falls through four tiers (`packages/target-wal/src/generic.ts`):

1. **Draft** — generated from the mapping dictionary v2 rules (`data/a360-ibm-rules.json`): the IBM
   command(s), parameter map, enum maps and required defaults. Sequences (`a + b`) write one line per
   command and chain object outputs (Pdf, Image, DataTable…) into the next command. Required
   parameters with no A360 source (`data/ibm-required-30.json`) get a default or a visible
   `{{ROSETTA: …}}` placeholder. Every generated line must pass `checkWal`, else it is not written.
2. **Template** — `httpRequest` skeleton for SaaS / REST commands.
3. **Script / state** — script packages (JavaScript, VBScript, Python) and commands that only change
   state (sessions, active sheet) or have no runtime effect.
4. **Stub** — a typed `Rosetta_<Package>_<command>` subroutine that fails on purpose with the
   proposed strategy in a comment; the call site keeps the A360 inputs as comments.

Nothing is dropped: the script always opens in Studio and every non-verified line carries a note.

## Consequences

- Any A360 bot converts end to end; coverage of verified commands is unchanged (generated drafts are
  `verify` notes until a Studio round, e.g. `corpus/ibm/probe-30.0.2/round-11`).
- Rules are data: improving the dictionary and rerunning `scripts/build-wal-rules.py` improves
  conversion without code changes.
