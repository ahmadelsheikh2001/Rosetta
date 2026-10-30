# Round 5: runs of 03 and 04 after round 4 fixes

- Date: 2026-10-30, Studio 30.0.2 debug mode
- Scripts: `03-strings-expressions.wal` and `04-error-handling.wal` from commit 04a5d9c
- Evidence: screenshots seen in the session, not kept (they show the server machine name / internal IP)

## 03-strings-expressions: same values as A360

```
part0=Hello | list1=Beta | name=Test User | date=06/11/2026 | len=18 | idx=7 |
out=Machine=<server> | Bot=Untitled 3.wal | CR={{ROSETTA: a360:AAControlRoom}}
```

`get` (index 1 → first item) and `strDictGet` work at runtime. Every value matches the A360 run except the
known differences (machine, bot name A-23, Control Room placeholder).

## 04-error-handling: inner Try/Catch works, outer Catch not reached

Globals when the debugger stopped:

| Variable | Value |
| --- | --- |
| rosettaTry2Failed | True |
| vErrMsg | File does not exist |
| vErrLine | 52 (WAL line of `readCSV`) |
| rosettaTry1Failed | False |
| vOuterErr | null |
| vStatus | not started |

The debugger stopped at line 42 (`failTest`) with "Error on line 42: Custom RR_04 error thrown on purpose
(WDG.Automation.Language.RuntimeException)"; the Continue button was enabled.

Findings:

- `onError` → handler subroutine → flag → `return` works for the inner Try: the CSV error was caught,
  `${rpa:errorMessage}` = "File does not exist", `${rpa:errorLineNumber}` = the WAL line (not the A360 line).
- The outer Catch did not run before the debugger stopped. Either the debugger stops on every error even
  when handled (the docs say debug mode shows the error and lets you continue), or the inner `onError`
  replaced the outer one for the rest of Try1.

## Changes made after this round

- After `goSub` of a nested Try, the enclosing handler is set again (`onError --label Catch1`), which covers
  the second explanation and is harmless under the first.
- To check: press Continue in debug mode, or run without debugging, and read `C:\RosettaTest\log.txt`.
