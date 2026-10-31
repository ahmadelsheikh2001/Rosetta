# ADR-022: Both directions: IBM RPA → A360 as well as A360 → IBM RPA

- **Status:** Accepted (steps 1–4 done; command coverage of the reverse direction growing)
- **Date:** 2026-10-31

## Context

The owner wants RPA Rosetta to convert in both directions: the existing A360 → IBM RPA, which keeps
improving, and IBM RPA (WAL scripts) → A360 task bots. The architecture already separates a source
reader, the vendor-neutral IR and a target generator (ADR-002, ADR-003), and the IR's `Platform`
already names `ibm-rpa`.

A second reason: in A360 → IBM every generated command can only be checked by the owner in IBM RPA
Studio, which this machine cannot reach. The A360 Community Edition Control Room is reachable by
the browser agent, so converted A360 bots could be imported, opened and run without the owner,
if bot content can be uploaded through the Control Room API (to be verified first, A-24).

## Decision

1. **Step 1, `@rosetta/source-wal`:** reads a `.wal` script into IR. Line based: `defVar` →
   variables; `if/elseIf/else/endIf`, `for/next`, `foreach/endFor`, `while/endWhile`,
   `do/loopWhile`, `break`, `continue`, `failTest` → IR statements; comments kept (the RPA Rosetta
   banner is skipped); every other command becomes an action `vendor:ibm-rpa/<verb>` whose args are
   the WAL parameters and whose outputs are its `var=output` assignments. Subroutines are inlined at
   their `goSub` (A360 has none); `onError`/`recover` handlers are not understood yet and are
   reported. Values: quoted text with `${…}` → template, bare `${x}` → variable, numbers and
   `True`/`False` → literals, `${rpa:…}` → system values.
2. **Step 2, `@rosetta/target-a360`:** IR → A360 bot JSON in the shape of corpus 01–09. Tested by
   round trip: A360 → IBM → A360 compared with the original.
3. **Step 3:** upload and run in A360 through the browser agent (needs A-24).
4. **Step 4:** the web UI offers "IBM RPA → A360".

Readers stay independent of writers: `source-wal` has its own WAL tokenizer and does not import
`target-wal`.

## Consequences

- IR action args are still named after the source command's parameters, so each generator must
  know the source naming of an op until args are normalised per canonical op (later ADR).
- Recorder captures cannot be produced from IBM selectors (A360 stores data it collects while
  capturing), so web element actions become manual re-capture work in A360.
- Coverage grows in command families, as in the other direction.
