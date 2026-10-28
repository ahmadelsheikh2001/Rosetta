# RPA Rosetta

Internal accelerator for RPA migration projects: converts bots between RPA platforms through a
vendor-neutral Intermediate Representation, with a migration and quality report for every bot.

**First direction:** Automation Anywhere A360 → IBM RPA (Studio 30.0.2).

> Status: **Phase 0, Foundation & Discovery.** Nothing converts yet. See [Roadmap](#roadmap).

## How it works

```
A360 export → Source Model → IR ─┬─ Source Checker → quality findings
                                 ├─ Assessment     → coverage, complexity, effort
                                 └─ Standards passes → WAL Model → .wal + config + report
```

- **IR**: [docs/ir.md](docs/ir.md)
- **Standards profiles**: [docs/standards-profile.md](docs/standards-profile.md)
- **Decisions**: [docs/adr/](docs/adr/README.md)
- **What we still need to verify**: [docs/assumptions.md](docs/assumptions.md)

## Packages

| Package                  | Layer                                                  |
| ------------------------ | ------------------------------------------------------ |
| `@rosetta/ir`            | Vendor-neutral model and traversal. No dependencies    |
| `@rosetta/expr`          | Source expression parser → IR expressions              |
| `@rosetta/source-a360`   | A360 export → Source Model → IR                        |
| `@rosetta/mappings`      | Data-driven mapping registry (YAML + handlers)         |
| `@rosetta/standards`     | Standards profiles, Source/Output checkers, transforms |
| `@rosetta/assessment`    | Coverage, complexity, sizing, quality score            |
| `@rosetta/report`        | JSON + HTML report, string catalog                     |
| `@rosetta/design-tokens` | Valleysoft brand tokens shared by report and future UI |
| `@rosetta/cli`           | `rosetta` command                                      |

A package may only depend on packages to its left in the pipeline (ADR-002, enforced by
TypeScript project references).

## Development

Requires Node 24 (see `.nvmrc`). The exact pnpm version is pinned in `package.json`
(`packageManager`) and provided by **corepack**, which ships with Node.

```sh
corepack pnpm install
corepack pnpm check      # format check, lint, build, test
```

### pnpm on company machines (no admin rights)

The usual setup, `corepack enable`, writes `pnpm` shims into the Node install folder
(`C:\Program Files\nodejs`). Without admin rights it fails with:

```
Internal Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarn'
```

You don't need it. Use one of these instead:

1. **Prefix every command with `corepack`** (works everywhere, nothing to install):
   `corepack pnpm install`, `corepack pnpm test`, ...
   The first run downloads the pinned pnpm into your user cache. In a non-interactive shell, set
   `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` to skip the download prompt.
2. **Install the shims into a folder you own** and put it on your user `PATH`:
   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.corepack-bin"   # must exist first
   corepack enable --install-directory "$env:USERPROFILE\.corepack-bin" pnpm
   # then add %USERPROFILE%\.corepack-bin to your user PATH and open a new terminal
   ```
   After that, plain `pnpm ...` works.

The git hooks and `pnpm check` call the tools directly (`npx`, `prettier`, `eslint`, `tsc`,
`vitest`), so they work whichever option you pick.

| Script             | Does                                     |
| ------------------ | ---------------------------------------- |
| `pnpm build`       | Type-check and compile all packages      |
| `pnpm test`        | Run all tests once                       |
| `pnpm lint`        | ESLint (type-checked)                    |
| `pnpm format`      | Prettier, write                          |
| `pnpm scan:corpus` | Corpus safety scan over all of `corpus/` |

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); a hook checks the
message. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

| Phase | Scope                                                     |
| ----- | --------------------------------------------------------- |
| 0     | Foundation, ADRs, IR v0, profile schema, format discovery |
| 1     | **Assessment report** (first internal demo)               |
| 2     | Core converter: variables, control flow, strings, errors  |
| 3     | Excel, files, credentials, browser (best-effort)          |
| 4     | Pilot and hardening                                       |
| 5     | AI fallback (opt-in, local-capable)                       |
| 6+    | Web UI, IBM → A360, more platforms                        |
