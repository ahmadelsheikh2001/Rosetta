# Architecture Decision Records

New decision: copy [`000-template.md`](000-template.md), take the next number, and link it here.

| ADR                                            | Decision                                                  | Status                                |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| [001](001-typescript-monorepo.md)              | TypeScript strict monorepo on Node LTS                    | Accepted                              |
| [002](002-source-model-and-ir.md)              | Separate Source Model, IR and Target Model                | Accepted                              |
| [003](003-structured-tree-ir.md)               | IR is a structured tree with full traceability            | Accepted                              |
| [004](004-canonical-action-vocabulary.md)      | Canonical action vocabulary with vendor passthrough       | Accepted                              |
| [005](005-hybrid-mapping-registry.md)          | Hybrid, data-driven mapping registry                      | Accepted                              |
| [006](006-expression-parser.md)                | Standalone expression parser                              | Accepted                              |
| [007](007-package-versions.md)                 | Package versions are part of the Source Model             | Accepted                              |
| [008](008-standards-engine.md)                 | Standards engine, profiles, three transform categories    | Accepted                              |
| [009](009-project-overrides.md)                | Project overrides file for deterministic re-runs          | Accepted                              |
| [010](010-report-design.md)                    | Two-dimensional report with externalised strings          | Accepted                              |
| [011](011-output-shape.md)                     | One WAL script per source bot                             | Accepted                              |
| [012](012-exception-category.md)               | Exceptions are system exceptions by default               | Accepted (pending company convention) |
| [013](013-effort-sizing.md)                    | Relative effort sizing                                    | Accepted                              |
| [014](014-ai-fallback.md)                      | AI fallback off by default, local-capable, always flagged | Accepted                              |
| [015](015-cli-first-offline.md)                | CLI first, fully offline                                  | Accepted                              |
| [016](016-tooling-scope.md)                    | Tooling scope for Phase 0 and 1                           | Accepted (partly deferred)            |
| [017](017-evidence-based-formats.md)           | Evidence-based file formats                               | Accepted                              |
| [018](018-brand-design-system.md)              | Brand and design system                                   | Accepted                              |
| [019](019-draft-and-verify-wal.md)             | Draft-and-verify for WAL syntax                           | Accepted                              |
| [020](020-try-catch-as-onerror-subroutines.md) | A360 Try/Catch/Finally as onError subroutines             | Accepted                              |
| [021](021-local-web-ui.md)                     | Local web UI (`rosetta serve`)                            | Accepted                              |
| [022](022-bidirectional-ibm-to-a360.md)        | Both directions: IBM RPA → A360 as well                   | Accepted                              |
| [023](023-tiered-fallback-conversion.md)       | Tiered fallback: every A360 command converts              | Accepted                              |
| [024](024-connector-packages.md)               | ServiceNow, SAP GUI, SAP BAPI (SAP NCo) by hand           | Accepted                              |
