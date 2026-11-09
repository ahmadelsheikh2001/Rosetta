# Contributing to RPA Rosetta

## Ground rules

- **TypeScript strict.** No `any` except at a validated boundary, with an inline
  `eslint-disable-next-line` and a reason.
- **Layering.** A package never imports a package above it (e.g. `source-a360` never imports a
  target package). Declare dependencies in both `package.json` and `tsconfig.json` `references`.
- **Small modules**, meaningful names, **JSDoc on every public export**.
- **Tests.** Every mapping has a fixture, every handler has a unit test, every corpus bot has a
  golden test. The registry meta-test enforces the first two.
- **No format guessing.** A360 field names and WAL command names must be Verified in
  [docs/assumptions.md](docs/assumptions.md) before they appear in code (ADR-017).
- **Offline.** No network calls anywhere in the tool (ADR-015).
- **Brand.** UI colours and fonts come only from `@rosetta/design-tokens` (ADR-018).

## Workflow

1. Branch from `main`.
2. `corepack pnpm check` must pass.
3. Commit with Conventional Commits, scoped by package:
   `feat(mappings): add a360 string replace mapping`.
   Allowed scopes are listed in `commitlint.config.js`.
4. Add a line to `CHANGELOG.md` under **Unreleased**.
5. A significant design decision needs an ADR ([template](docs/adr/000-template.md)).

## Adding a mapping

You can extend coverage without touching the core.

1. **Find evidence.** The command must appear in a corpus bot. Note the file and node path.
2. **Create the entry** at
   `packages/mappings/registry/a360/<package>/<command>.yaml`:

   ```yaml
   id: a360.<package>.<command> # lower-case, dot/dash separated, unique
   source:
     platform: a360
     package: <package name exactly as in the export>
     command: <command name exactly as in the export>
   status: planned # planned | partial | mapped | unsupported
   irOp: <family>.<verb> # required for partial / mapped
   handler: <handlerName> # optional, see below
   evidence:
     - corpus/a360/02-control-flow/export.zip#<path to node>
   notes: Anything a reviewer should know (semantic differences, limits).
   ```

3. **Add a fixture** (required for `partial` and `mapped`) at
   `packages/mappings/fixtures/<id>.yaml`: a minimal source node and the expected IR.
4. **Need logic?** Add `packages/mappings/src/handlers/<handlerName>.ts` and a sibling
   `<handlerName>.test.ts`, then reference it with `handler:`.
5. Run `corepack pnpm test`. The registry meta-test tells you what is missing.

Use `planned` for commands you have seen but not converted yet: they count as unmapped in the
Assessment coverage, which is exactly what we want to show.

## Adding a quality rule

Quality rules arrive in Phase 1 (`packages/standards`). Each rule has an id in the profile
schema (`qualityRuleId`), a positive and a negative test, and a message in the report catalog.
