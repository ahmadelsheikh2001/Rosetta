# Round 6: 04-error-handling.wal runs to completion

- Date: 2026-10-30, Studio 30.0.2 (debug mode, Continue pressed when the debugger stopped)
- Script: `04-error-handling.wal` from commit 9e7cea9 (outer `onError` restored after the nested Try)
- `C:\RosettaTest\missing.txt` absent

## C:\RosettaTest\log.txt

```
Inner catch: File does not exist (line 53)
Outer catch: Custom RR_04 error thrown on purpose (line 43)
cleanup done
```

## Findings

- The A360 Try/Catch/Finally conversion (ADR-020) behaves like A360: the inner Catch handles the missing
  file, the Throw (`failTest`) is caught by the outer Catch, and Finally runs last.
- Restoring the outer handler with a second `onError` after the nested Try is needed or at least sufficient.
- Line numbers are WAL script lines (53, 43), not A360 lines (A-22): a known, reported difference.
- Error message for a missing CSV file: "File does not exist" (A360 message not recorded yet).
