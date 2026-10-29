# ADR-020: A360 Try/Catch/Finally as onError subroutines

- **Status:** Accepted (pattern documented, to confirm by running RR_04 in Studio)
- **Date:** 2026-10-29

## Context

IBM RPA has no try/catch command: Studio 30.0.2 rejected `tryCatch` (round 1). The IBM RPA 30.0.x
reference handles errors with **Handle Error** (`onError --label handler`), which watches the
subroutine it is called in, and a handler subroutine that must end with **Recover From Error**
(`recover`) or **Stop Execution**. `recover` resumes at the command after the one that failed,
whereas A360 leaves the Try block at the first error.

## Decision

Each A360 Try becomes a subroutine `TryN` whose first command is `onError --label CatchN`; the Catch
becomes the handler `CatchN`. A Boolean helper `rosettaTryNFailed`, reset before `goSub --label TryN`,
is set by the handler, and after every command of the Try body that can fail the subroutine returns
if the flag is set. Finally commands are written in the calling flow, right after `goSub`. Handlers
never return early, so they always end with `recover`. All conversion subroutines are placed after
the main flow.

Limits (reported as manual work): several Catch blocks (only the first is converted), Catch by
exception type (WAL catches every error), Try/Finally without Catch, a Catch that throws again.

## Consequences

Behaviour matches A360 for the corpus cases, at the cost of extra lines (the flag checks) in the
generated script. To confirm in Studio: nested Try (does the outer `onError` apply again after the
inner subroutine returns?) and the run order of RR_04.
