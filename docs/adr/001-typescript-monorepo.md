# ADR-001: TypeScript strict monorepo on Node LTS

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The team works in Node.js/TypeScript. The tool needs a typed IR, JSON-heavy parsing, a CLI now and possibly a Web UI later.

## Decision

- TypeScript in `strict` mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any` except at validated boundaries.
- pnpm workspaces monorepo; one package per layer under `packages/`; TypeScript project references.
- Node Active LTS, pinned in `.nvmrc` (24 at the time of writing).
- TypeScript is pinned to 6.0.x because typescript-eslint does not yet support TypeScript 7 (native compiler). Revisit when it does.

## Consequences

One language from parser to future UI. Layer direction is enforced at compile time by project references; the stricter tool is deferred (ADR-016).
