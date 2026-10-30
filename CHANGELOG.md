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

### Planned (deferred by ADR-016)

- dependency-cruiser layer enforcement
- Changesets for automated changelog and versioning
- Dependency license check
- CI pipeline (pending the source-control platform)
