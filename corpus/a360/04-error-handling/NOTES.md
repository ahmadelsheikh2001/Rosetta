# RR_04_ErrorHandling

## Provenance

- Source: A360 **Community Edition** Control Room, `Bots\RPA_Rosetta_Samples`
- Retrieved: 2026-10-29, raw bot content (same retrieval as RR_01), received as `a360_04-error-handling_bot.json`
- File: `bot.json`, 8444 bytes, SHA-256 `105c841f804e838ab2c4b9bc665c3698aedd73191d35c2fdb962c6d77198a900`
  (computed in the repo; no source hash was supplied for this file)
- Encoding: ASCII-only, single line, valid JSON
- Corpus scan: clean (after fixing two scanner false positives: JSON-escaped drive paths, UUID digit groups)

## Packages and versions (from `packages`)

Boolean 2.13.3; Comment 2.17.0; CsvTxt 2.15.1; ErrorHandler 2.13.0-20241115-120032; If 3.8.0-20241115-115929;
LogToFile 3.11.1; MessageBox 3.8.1; Number 3.11.5; Step 2.7.0; String 5.12.6

## Run result

Not run yet. **Expected** order (to confirm by running): inner Catch logs the error, then Throw fires,
then the outer Catch logs it, then Finally runs.

## Build log (as delivered during the build)

**Variables**
- vFilePath: String, C:\RosettaTest\missing.txt, input
- vStatus: String, "not started", output
- vErrMsg: String, empty
- vOuterErr: String, empty
- vErrLine: Number, 0
- vDoThrow: Boolean, True
- vFileTable: Table, no default, created from the CSV/TXT Read action
- SampleNumber / SampleString: added by the template

**Step 1 "Try Catch Finally"**
1. Comment: "RR_04: outer Try with nested inner Try, Catch, Throw and Finally"
2. Error handler: Try (outer, ErrorHandler.try)
   - Error handler: Try (inner)
     - CSV/TXT: Open (CsvTxt.OpenCSVTXT): session "Default", Desktop file `$vFilePath$` (stored as `file://$vFilePath$`, type FILE), no header, delimiter comma, no trimming, encoding UTF-8
     - CSV/TXT: Read (CsvTxt.ReadFromCsvTxt): session "Default" → vFileTable
   - Error handler: Catch (inner): exception AllErrors (BotException), "On error, continue" OFF, error message → vErrMsg, line number → vErrLine
     - Logging: Log text to file: C:\RosettaTest\log.txt, text `Inner catch: $vErrMsg$ (line $vErrLine.Number:toString$)`, Append, timestamp OFF, ANSI
   - If, Boolean condition: `$vDoThrow$` Equals True
     - Error handler: Throw: message "Custom RR_04 error thrown on purpose", exception AllErrors
3. Error handler: Catch (outer): AllErrors, message → vOuterErr, line number → vErrLine
   - Log text to file: `Outer catch: $vOuterErr$ (line $vErrLine.Number:toString$)`, same settings
4. Error handler: Finally
   - Log text to file: "cleanup done", same settings
   - String: Assign "finished" → vStatus

**Step 2 "Wrap up"**
5. Comment: "RR_04: wrap up after error handling"
6. **[DISABLED]** Message box: `Disabled on purpose: status=$vStatus$ inner=$vErrMsg$ outer=$vOuterErr$`

**Notes from the build**
- There's no single "read file" action; CSV/TXT Open + Read on the missing file was used, so the error comes from Open.
- Catch/Finally are stored in the Try node's `branches`. The error message and line number outputs are under
  `returns.errorMessage` / `returns.errorLineNumber`, not as attributes.

### Run 1 (2026-10-30): NOT the intended scenario

`missing.txt` existed (empty file), so CSV Open did not fail and the inner Catch did not run.
Log (`corpus/a360/runs/2026-10-30/log.txt`, lines 10–11, CRLF):

```
Outer catch: Custom RR_04 error thrown on purpose (line 10)
cleanup done
```

Findings:

- The outer Catch runs before Finally (A-20, partly).
- The Throw is reported at line 10: nodes are counted in order including the inner Catch branch
  (Step 1, Comment 2, Try 3, Try 4, Open 5, Read 6, Catch 7, Log 8, If 9, Throw 10) (A-22).
- `vErrLine` holds the line of the failing node; WAL `${rpa:errorLineNumber}` counts WAL lines, so the
  numbers will differ after conversion.

To repeat with `missing.txt` absent.
