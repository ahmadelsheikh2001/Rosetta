# IBM RPA → A360: import, editor and run check (ADR-022 step 3)

- Date: 2026-10-31, A360 Community Edition, folder `Bots\RPA_Rosetta_Samples`, browser agent.
- Input: `out/a360/*.json` from commit fd43ba1, made from the Studio-tested WAL scripts in
  `packages/cli/golden/wal` (01, 02, 03, RR_08_Child).
- Method: empty target bots made in the editor (Create > Task Bot; creating by API was not found,
  A-24), content written with `PUT /v2/repository/files/{id}/content`, opened in the editor, run.
  Every upload returned HTTP 200 and was stored byte for byte; the editor changed nothing.

| Target bot                    | Editor                      | Run                                               |
| ----------------------------- | --------------------------- | ------------------------------------------------- |
| RR_IBM_01-variables           | no markers                  | success                                           |
| RR_IBM_02-control-flow        | errors on lines 23 and 24   | blocked: "Automation with errors"                 |
| RR_IBM_03-strings-expressions | no markers                  | deploy failed: line 15, `$System:Date$` not found |
| RR_IBM_RR_08_Child            | no markers                  | success                                           |
| RR_IBM_BadVersion (test)      | "Package not found", line 1 | blocked: "Automation with errors"                 |

Findings and fixes (commit after this file):

- **02, line 23–24:** the dictionary-keys loop came back as a List iterator over a Dictionary
  ("Variable not allowed") with the undeclared WAL helper `rosettaEntry1` ("Variable not found").
  Fixed: `source-wal` reads a foreach over `StringKeyValuePair` entries that starts by taking the
  key as a dictionary-keys loop; `target-a360` writes `dictionary.iterators.keys`.
- **03, line 15:** `deployment.compilation.failed`, "could not find the variable 'Date' in the
  package 'System'". The original A360 bot lists the `System` package (3.18.2); the generator did
  not. Fixed: `System` is added whenever a `$System:…$` value is used. The
  `{{ROSETTA: a360:AAControlRoom}}` placeholder written by target-wal now comes back as
  `$System:AAControlRoom$`.
- **The upload API validates nothing** (`hasErrors` stays false). New `checkA360` reports what the
  editor and compiler rejected: undeclared variables, iterator over the wrong variable type,
  package versions this Control Room lacks, unknown or package-less `$System:…$` values. On the four
  files as uploaded it reports exactly the errors above; on the regenerated files, none.
- Editor-time errors block a run ("Automation with errors"); `$System:…$` problems appear only when
  the bot is compiled for a run.
- Worked as generated: nested If / Else If / Else, Break and Continue with loop labels, While,
  list loop, `$vDict{$vKey$}$`, `.Number:toString` / `.Boolean:toString`, comments, disabled
  actions, variables without defaults (CREDENTIAL, TABLE).
- RR_08_Child asked for `inName` without a default; the generator now writes `""` for STRING
  variables without a value, as the original does.
- The message box of RR_IBM_01 was closed on the Bot Agent desktop; its text is not recorded.

## Re-test with the regenerated files (commit ad1d324)

All four uploads returned HTTP 200 and were stored byte for byte (01: 7,116 bytes, 02: 12,518,
03: 10,217, RR_08_Child: 1,121).

| Target bot                    | Editor                       | Run                                  |
| ----------------------------- | ---------------------------- | ------------------------------------ |
| RR_IBM_01-variables           | 14 lines, no markers         | success; message box text as below   |
| RR_IBM_02-control-flow        | 29 lines, no markers         | success                              |
| RR_IBM_03-strings-expressions | 22 lines, no markers         | success; message box text as below   |
| RR_IBM_RR_08_Child            | 1 line, no markers           | success; input uses its default `""` |

All four converted bots open without markers and run to completion. Round trip A360 → IBM RPA →
A360 is confirmed in a real Control Room for 01, 02, 03 and RR_08_Child.

- 01 message box, read on the Bot Agent desktop by the user, matches the original A360 bot:
  `vStr=Updated Test User | vNum=105 | vBool=false | first item=Alpha | name=Test User`.
- 02: the "For each key in the dictionary" loop is accepted; the errors on lines 23 and 24 are gone.
- 03: no deploy error now that the `System` package is declared; `$System:Date$` (line 15) and
  `$System:AAControlRoom$` (line 20) both resolve. Message box (machine name and Control Room URL
  removed): `part0=Hello | list1=Beta | name=Test User | date=07/11/2026 | len=18 | idx=7 |
out=Machine=<machine> | Bot=\Bots\RPA_Rosetta_Samples\RR_IBM_03-strings-expressions | CR=<url>`.
  `$System:AATaskName$` gives the full repository path, as in the original A360 bot.
- An earlier 01 run, left waiting at its message box, was aborted by the Control Room after about
  30 minutes (RUN_ABORTED); the run that counts is the later one.

## RR_IBM_04-error-handling (Try / Catch / Finally, commit f463263)

- Upload 200, 17,475 bytes, stored byte for byte. Editor: 18 lines, no markers; outer Try with a
  nested Try, two Catch blocks (shown as "AllErrors", the editor's name for `BotException`), the
  Throw inside an If, and Finally, as in corpus 04.
- Run: `deployment.compilation.failed` on line 8, "could not find the action 'toString' in package
  'Number'". Lines 8 and 12 use `$vErrLine.Number:toString$`, but `Number` was not in the bot's
  packages. As with `$System:Date$` in 03, a package used only inside an expression must be listed.
- Fixed: the generator lists every package named in an expression (`$x.Pkg:fn$`), and `checkA360`
  reports one that is missing. On the uploaded file it reports exactly lines 8 and 12.
- Re-test with the fix (commit a955ee7): upload 200, 17,570 bytes (only change: Number 3.11.5 in
  packages). Editor: 18 lines, no markers. Run: COMPLETED, 18/18 lines, no error. The log file on
  the Bot Agent machine gained, as in A360's own run of corpus 04 minus the CSV read:
  `Outer catch: Custom RR_04 error thrown on purpose (line 10)` then `cleanup done`, and no inner
  catch line (the CSV read is still a TODO comment, so the inner Try does not fail). The Throw
  reached the outer Catch with its message and line number, and Finally ran after it.

## RR_IBM_05-excel (Excel, commit d85bb9c)

- Upload 200, 8,092 bytes, stored byte for byte. Editor: 6 lines, no markers; Open, "For each row
  in worksheet" into `$vRow$` with the log inside, Set cell C1, Save, Close (save on close), as in
  corpus 05. Set cell and Close show session "Default".
- Run: RUN_FAILED at line 4, `ba.bot.execution.error`: "Unable to set the value in the specified
  cell because it is in the header row and Contains header is enabled." Lines 1–3 ran.
- The corpus file itself writes C1 with `containsHeader` true, so the conversion is faithful; the
  browser agent reports that RR_05_Excel in the Control Room writes C2. To settle: compare the
  Control Room's RR_05_Excel with `corpus/a360/05-excel/bot.json`.
- `checkA360` now reports Set cell in row 1 of a session opened with "Sheet contains a header". The
  round trip accepts a problem only when the original has it too.
- Settled: RR_05_Excel in the Control Room is revision 2 (2026-10-30 21:16 UTC), which writes C2.
  Its SHA-256 (`3fe7d93b…3b4d72`, from the agent) equals the corpus file with C1 → C2, so the corpus
  held revision 1. `corpus/a360/05-excel/bot.json` is now revision 2 and the outputs follow.
