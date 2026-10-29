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

### Planned (deferred by ADR-016)

- dependency-cruiser layer enforcement
- Changesets for automated changelog and versioning
- Dependency license check
- CI pipeline (pending the source-control platform)
