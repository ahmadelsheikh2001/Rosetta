# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer once released.

## [Unreleased]

### Added

- Monorepo foundation: pnpm workspaces, TypeScript 6 strict with project references, ESLint
  (type-checked) + Prettier, Vitest, commitlint + husky.
- `@rosetta/ir`: IR v0 types (bots, variables, statements, expressions, UI targets, diagnostics)
  and `walk` / `childBlocks` traversal.
- `@rosetta/mappings`: registry entry schema, loader, and the registry meta-test.
- `@rosetta/standards`: standards profile schema and built-in defaults.
- `@rosetta/design-tokens`: Valleysoft Brand Guidebook 2025 palette, tints, typography,
  logo clear-space rule, CSS custom properties.
- Brand rules completed (ADR-018): full logo usage rules and variants, logo colour version per
  background, white allowed, status tokens (auto/review/blocked/info) always with icon + label.
- Corpus safety scan (`scripts/scan-corpus.mjs`) in the pre-commit hook: IPs, internal-looking
  URLs, network shares, IBAN-like values and long digit runs, including inside zip exports;
  allow-list in `corpus/.scanallow`.
- Guides for preparing inputs: `docs/guides/a360-samples.md`, `docs/guides/wal-probe.md`.
- ADR-001 to ADR-018, Assumptions Register, IR and standards-profile docs, corpus layout and
  sanitisation checklist, CONTRIBUTING, corepack workaround for machines without admin rights.

#### Phase 1 early start (format-independent)

- `@rosetta/ir`: expression traversal (`walkExpr`, `statementExprs`, `referencedVariables`),
  hand-built IR factories, `mappingId` on actions.
- `@rosetta/standards`: profile layering (defaults → company → client → project) with
  provenance and errors that name the layer and file; `rosetta.project.yaml` envelope;
  rule engine with six IR-only quality rules (missing error handling, empty catch, deep nesting,
  disabled code, unused variables, missing comments) and pending slots for five rules that need
  verified A360 samples. Profile gains `quality.commentsRequiredAbove`,
  `quality.scorePenalty` and `stages`.
- `@rosetta/assessment`: registry coverage, complexity score, S/M/L/XL sizing and hours,
  Source Quality Score, portfolio summary; synthetic six-bot portfolio for previews.
- `@rosetta/report`: offline, branded HTML (management summary, per-bot drill-down, print
  stylesheet, embedded Montserrat/Chakra Petch) and JSON; English string catalog with plurals;
  "Synthetic data" banner.
- `@rosetta/cli`: `rosetta assess` (validates inputs and profile, parser stub exits 5),
  `rosetta preview-report`, help, version, stable exit codes.
- `docs/guides/conventions-template.md` for company profile v0.

#### Phase 1: reading real A360 bots

- `@rosetta/expr`: A360 expression parser (variables, list index, dictionary key, nested
  `$vDict{$vKey$}$`, inline conversions, system variables); unreadable input becomes `raw`.
- `@rosetta/source-a360`: Zod Source Model of the task bot JSON, lifter to IR (Steps, comments,
  If/Else If/Else, all five corpus loop kinds with labels, break/continue targets,
  Try/Catch/Finally with error outputs, Throw, actions as vendor ops), folder reader, reading
  diagnostics. Golden IR tests over corpus 01–04.
- `@rosetta/ir`: loop labels, break/continue targets, do-while flag, `dictKeys` loops, catch
  `lineVar`, best-effort `body` on unknown nodes.
- `@rosetta/mappings`: 24 `planned` registry entries for every action command in the corpus.
- `@rosetta/standards`: `hardcoded-credential` rule (credential variables with a literal value).
- `@rosetta/report`: reading notes per bot and a list of files that could not be read.
- `rosetta assess` now reads real bot files and writes the report; golden assessment of the corpus.

#### Phase 2 start: draft WAL generation (ADR-019)

- `@rosetta/target-wal`: IR → IBM RPA WAL draft (variables, Steps, comments, If/Else If/Else,
  loops, break/continue, Try/Catch with emulated Finally, Throw, 18 of 24 corpus commands), with
  per-line notes (syntax to verify, behaviour differences, manual work). Credentials are never
  written as literals; disabled code is kept as comments.
- `rosetta convert <input-dir>`: writes `<bot>.wal`, `<bot>.notes.md` and `CONVERSION.md`.
- Registry: the 24 corpus commands now lift to canonical ops (`partial`), each with a fixture
  from the corpus and a fixture runner test.
- Golden WAL tests over corpus 01–04.

#### WAL from the IBM RPA 30.0.x reference

- Studio round 1 applied: backslashes escaped, numbers unquoted, no `tryCatch`.
- Generator rewritten against the IBM RPA 30.0.x command reference and the Studio toolbox: all 24
  corpus commands now convert (`changeTextCase`, `parseText`, `addToDateTime`, `dateTimeToText`,
  `convertStringToNumber`, `convertNumberToText`, `strDictAdd`, `incrementVar`, …).
- A360 Try/Catch/Finally → `onError` handler subroutines with a failed flag (ADR-020).
- Dictionary key loops, do-while, `$System:Machine$` (`getEnvVar`) and `$System:AATaskName$`
  (`${rpa:scriptName}`); list defaults as `--value "[a,b]"`.
- `docs/mappings/a360-to-ibm-rpa.md` (what converts, what has no equivalent),
  `docs/formats/wal-30.0.2.md`, toolbox evidence in `corpus/ibm/toolbox-30.0.2`.

#### Verified in IBM RPA Studio and static check

- Studio rounds 1–7: all four corpus bots convert, open and run; RR_03 matches the A360 run value for value,
  RR_04 error handling runs in the A360 order (ADR-020 verified).
- List items / dictionary values read with `get` (1-based) and `strDictGet`; defVars before commands;
  subroutines at the bottom; outer `onError` restored after a nested Try.
- A360 log formats reproduced: timestamp prefix `(M/d/yyyy h:mm:ss tt)` and the Log variables layout.
- Static WAL checker (`checkWal`): command catalog with required parameters and allowed values, plus the
  Studio structure rules; it finds all nine errors of round 1. `rosetta convert` reports its result per bot.

#### Excel, sub-bots and vault credentials (corpus 05 and 08)

- Corpus: RR_05_Excel, RR_08_Parent and RR_08_Child (byte-exact exports, hashes checked).
- `@rosetta/source-a360`: SESSION, vault CREDENTIAL, TASKBOT and RECORD values; Excel row loop
  (`loop.iterators.excel`); Run Task Bot lifted to `callBot` with its inputs and outputs.
- Registry: Excel_MS OpenSpreadsheet, SetCell, SaveSpreadSheet, CloseSpreadsheet and
  Credential assignToCV, each with a corpus fixture.
- `@rosetta/target-wal` (from the IBM RPA 30.0.x reference, to verify in Studio): `excelOpen`,
  `excelSet`, `excelClose --save`; the row loop as `excelGetTable` + `for` + `mapTableRow` with one
  variable per column read; Run Task Bot as `executeScript` with JSON inputs/outputs; vault
  credentials read with `getVaultItem`, never written as values.

#### Brand

- Official Valleysoft logo files (transparent PNG, B-05) in `packages/report/assets/logo`; the report
  masthead shows the white logo, embedded so the report stays offline.

#### Web UI (ADR-021)

- `rosetta serve` (`pnpm ui`): local web UI on 127.0.0.1. Choose the conversion, upload A360 bot
  files, convert, then view each IBM RPA script with line numbers and its notes, download the
  scripts, notes, a ZIP of everything, or open the assessment report. Files never leave the
  computer: local-only binding, Host check, JSON-only API, strict Content-Security-Policy.

#### Browser and Recorder (corpus 09)

- Corpus 09-web-form: the owner's A360 web-form bot, sanitized (page address, user path and
  capture blobs removed; see its NOTES).
- Lifter: Recorder captures as UI targets (selector criteria), WINDOW variables, the CSV row
  iterator, disabled Else branches; record columns written with quotes (`{"Company Name"}`).
- WAL: `webStart`/`webNavigate`, `webSet`, `webSetComboBox`, `webClick` with the element id (else
  XPath, else CSS) and the A360 wait as `--timeout`; CSV rows via `readCSV` + `for` + `mapTableRow`;
  percent-encoded file paths decoded.
- Reading messages without a node now name their file.

#### IBM RPA → A360, step 1 (ADR-022)

- `@rosetta/source-wal`: reads IBM RPA WAL scripts into the IR: variables and types, comments,
  If/Else If/Else, For, For Each, While, Do-While, Break/Continue, Throw, subroutines inlined at
  their `goSub`, every other command as an action with its parameters and outputs. Golden IR over
  the converted corpus. `onError`/`recover` (the Try/Catch pattern) are reported, not rebuilt yet.

#### IBM RPA → A360, step 2 (ADR-022)

- `@rosetta/target-a360`: IR → A360 task bot JSON in the shape of the corpus (node, condition and
  loop shapes and package versions copied from corpus 01–09; stable uids). Commands: assignments by
  variable type, message box, log to file (with timestamp), log variables, string commands, number
  to text / increment, list add, dictionary put, date commands. Undoes what target-wal adds (helper
  variables, `get`/`strDictGet`, timestamp lines, initial-value lines, machine name). Anything else
  becomes a TODO comment and a manual note; credential values are never written.
- `source-wal`: Steps rebuilt from `// ---- title ----` markers; `// [DISABLED]` lines read as
  disabled code.
- Round trip A360 → IBM RPA → A360: corpus 01, 03 and RR_08_Child come back as the original,
  02 at 25/27 (the folder loop has no WAL form).

#### IBM RPA → A360, steps 3 and 4 (ADR-022)

- `checkA360`: reports before upload what the A360 editor and compiler rejected in the import test
  (undeclared variables, iterator over the wrong variable type, unknown package versions,
  `$System:…$` without the System package). The four converted bots run in A360 (corpus run
  2026-10-31-ibm-import).
- Web UI: "IBM RPA (WAL script)" as a source, converted to A360 task bots. Upload `.wal` files;
  each bot shows its JSON, notes and A360 check problems, with downloads (`.json`, notes, zip).
  The target follows the chosen source. `POST /api/convert` accepts `ibm-rpa` → `a360` and
  returns `content` (was `wal`) for both directions.
- Try / Catch / Finally back to A360: `source-wal` reads the onError subroutines of ADR-020 (Try
  subroutine, Catch subroutine with error message and line variables, flag guards, restored outer
  handler) as an IR try; `target-a360` writes the try node with catch and finally branches as in
  corpus 04. target-wal now closes the Finally commands with `// A360 Finally end`. Round trip 04:
  16/18 (the CSV commands have no A360 form yet).
- A package used only inside an expression (`$x.Number:toString$`) is listed in the bot's
  packages; A360 refused to deploy RR_IBM_04 without it. `checkA360` reports it too.
- Excel back to A360 (corpus 05): `source-wal` reads target-wal's table loop (`excelGetTable`,
  `for`, `mapTableRow` into one variable per column) as a loop over the session rows into the
  record variable (`$vRow{Name}$`), and the "Save workbook" comment as a save. `target-a360`
  writes Excel_MS open (session), the row iterator, set cell, save and close. Round trip 05: 6/6.
- `checkA360` reports Set cell in the header row of a sheet opened with headers (RR_IBM_05 run).
  Corpus 05 is now revision 2 of RR_05_Excel (C2); the corpus held revision 1 (C1).
- Sub-bots and the vault back to A360 (corpus 08): `executeScript` with JSON parameters/output →
  Run Task Bot (inputs and outputs as dictionaries); the `getVaultItem` reads of the initial values
  → CREDENTIAL variable defaults (vault reference only, never a value); a later read of the same
  vault item → Credential `assignToCV` copy. WAL has no locker and no bot folder, so
  `generateA360` takes `vaultLocker` and `botFolder`; without them the notes say what to set. The
  web UI asks for both (optional) when converting to A360 and validates them. Round trip 08
  Parent: 4/4.

#### Commands from real-world A360 exports (A-25)

- Measured on 11 external task bots (Bot Store and GitHub exports, kept outside the repo): 291
  commands, 108 places left as manual work. The most frequent gaps are now converted to WAL:
  Excel create workbook (`excelOpen` on a new path), create worksheet and switch to sheet (Excel
  commands name the sheet with `--sheet`), Delay (`delay --timeout` time span), Number decrement
  (`evaluate`), create folder (`createDir`) and create file (`writeToFile` with empty content).
  Manual places on the same bots: 38.
- REST, JSON and email (A-25): REST Web Service GET / POST → `httpRequest` (custom headers in a
  StringDictionary helper, Content-Type as `--formatter`, timeout, Body output or the Body key of
  the response dictionary); JSON StartSession / GetNodeValue → `mapJson` with a JSONPath from the
  dotted node path; Email connect (Outlook) / send / close → `outlookConnect`, `emailSend`
  (addresses split into a list at ";"), `emailDisconnect`. Generic A360 lifting now keeps outputs
  returned as a dictionary by key. Manual places on the 11 external bots: 27.
- IBM RPA → A360 for hand-written scripts (measured on a real 822-line Studio script, kept outside
  the repo; notes 451 → 235): string conditions is empty (`EQ ""`), contains (`INCLUDE`) and not
  equal (`NEQ`), number `LTE`; `excelSet` on a named sheet by row and column → Switch to sheet
  (only when the sheet changes) and Set cell at the address (`B3`, `AB$row$`); `logMessage` →
  Log to file with the level in front, into the `logFile` option (web UI field; default
  `C:\Logs\<bot>.log` with a note); `replaceText` with a real regex → String replace with the
  regular-expression option and a note on Java vs .NET rules. Still manual: `getRegex` (no A360
  shape seen yet), a cell whose column is a variable, PDF / OCR.
- Corpus 11 (RR_11_Missing, built in our Control Room): File Copy, String Find (regex), JavaScript
  Open / Run / Close, PDF Extract text, OCR Capture text by path, Task Bot Stop, arithmetic Number
  Assign and a list item by number. IBM RPA → A360 now writes: `getRegex` / `isMatch` with a
  JavaScript helper opened once around the bot (parameters as one list, regex flags from
  RegexOptions, n-th match still manual); `recognizeText` and `pdfText` → OCR Capture text by path
  (PDF Extract text writes only to a file); `fileCopy` → File Copy; `stopExecution` → Task Bot
  Stop. `checkA360` reports a NUMBER or BOOLEAN variable inside text ("Invalid expression", seen
  in corpus 11). A360 → IBM RPA: File Copy → `fileCopy`, Task Bot Stop → `stopExecution`; fixed
  a list default with a backslash (now added item by item, escaped) and arithmetic in Number
  Assign (now `evaluate`, was a quoted `setVar`). ABE OCR: manual places 106 → 15.
- IBM RPA → A360: `dateDifference` → Datetime Difference between dates in seconds (shape from an
  external export; TimeSpan variables become NUMBER with a note); `evaluate` arithmetic on number
  variables → Number: Assign expression; `excelSet` with the column in a variable → cell address
  from a column-letters list (`$rosettaColumns[$n$]$$row$`). The last two are A-26 (to verify).
  ABE OCR: manual places 145 → 106, all of them now getRegex, isMatch, PDF, OCR, stop, file copy.
- A script's own `onError --label H` becomes a Try around the rest of its block with H as the
  Catch (a trailing `recover` is noted: A360 leaves the Try). Variables of a type A360 lacks
  (TimeSpan, Pdf) are declared as STRING with a note, so converted commands that use them do not
  fail with "Variable not found". Notes repeated by inlined subroutines are shown once with a
  count (ABE OCR: 235 → 60 lines, A360 check problems 2 → 0).
- `.wal` files saved by Studio 30.0.2 are read: they are a protobuf envelope around the script
  (W-19). `readWalFile` (source-wal) and the web UI take the script out; before, the header bytes
  became an unknown command and the footer broke the last `endSub`.
- Web UI redesigned with tabs: Convert (direction and files side by side, action bar), Results
  (summary, messages folded, list of bots on the left and the chosen bot on the right) and
  Assessment report (shown in the page, with open and download). Sizes in MB; phone layout
  stacks.
- Control Room export zips are read: `readExportZip` (source-a360) takes the task bots and API task
  bots listed in `manifest.json` and leaves packages, forms, AI agents and workflows unread (they
  are reported). `rosetta convert` / `assess` read zips in the input folder; the web UI opens a
  zip in the browser and uploads only its bots.

### Planned (deferred by ADR-016)

- dependency-cruiser layer enforcement
- Changesets for automated changelog and versioning
- Dependency license check
- CI pipeline (pending the source-control platform)
