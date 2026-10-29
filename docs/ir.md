# Intermediate Representation (IR) v0

Source: [`packages/ir/src`](../packages/ir/src). Decisions: ADR-002, ADR-003, ADR-004.

The IR is the vendor-neutral model every parser lifts into and every generator lowers from.
v0 is a first cut, refined once real A360 samples arrive (see `docs/assumptions.md`).

## Shape

```
Project
 ├─ bots: Bot[]
 ├─ dependencies: Dependency[]     Bot → Bot | file
 └─ diagnostics: Diagnostic[]

Bot
 ├─ id, name, description?, source: SourceRef
 ├─ packages: PackageVersion[]     (ADR-007)
 ├─ variables: Variable[]          name, type, direction, default?, sensitive
 └─ body: Block                    = Statement[]
```

## Statements

| Kind                 | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `action`             | One operation: canonical `op` (`excel.open`) or `vendor:a360/...` passthrough |
| `if`                 | Ordered branches (`if`, `else if`...) plus optional `else`                    |
| `loop`               | `times`, `while` or `forEach` over list/dict/table rows/files/folders         |
| `break` / `continue` | Loop control                                                                  |
| `try`                | Body, catch clauses (with optional error variable), optional `finally`        |
| `throw`              | Raises an error with a `category`: `system` (default) or `business` (ADR-012) |
| `callBot`            | Calls another bot with input/output bindings                                  |
| `stop`               | Ends the bot                                                                  |
| `group`              | Named block, e.g. an A360 Step; preserved as a group/comment in output        |
| `comment`            | Source comment                                                                |
| `unknown`            | Source node not understood; raw JSON kept verbatim, always reported           |

Every statement has a stable `id`, an optional `source: SourceRef` and an optional `disabled` flag.
Actions may carry a `resource` (the session/handle variable they work on) and a `target`
(a `UITarget` with selector strategies and the raw capture).

## Expressions

`literal`, `var` (with index/key access path), `template` (string interpolation), `call`,
`binary`, `unary`, `system` (platform variables) and `raw` (unparsed source text, always reported).

## Types

`string`, `number`, `boolean`, `datetime`, `list<T>`, `dict<T>`, `table`, `record`,
`credential`, `handle<resource>`, `any`, and `unknown` (keeps the source type name).

## Diagnostics

Diagnostics hold a stable `code`, `severity`, `category`, and a `messageId` plus `params`.
Text is resolved from the report string catalog, so the report can be translated (ADR-010).

## Traversal

`walk(block, visitor)` visits statements depth-first in source order with depth and ancestors;
`childBlocks(stmt)` returns a statement's nested blocks. Checkers and the assessment are built on these.

## v0.2 additions (from the real corpus)

- Loops carry an optional `label`; `break` / `continue` an optional `target` label (A360 `anchor`).
- `while` loops may set `checkAtEnd` (do-while).
- `forEach` collection `dictKeys` iterates a dictionary's keys.
- Catch clauses may bind `lineVar` (line number of the failing statement).
- `unknown` statements may carry a best-effort `body`, so nested statements are still assessed.
- Actions carry `mappingId` when the lifter found the command in the registry.
- Branch nodes (Else, Catch, Finally) are addressed after the children in `SourceRef.nodePath`.

## Open points for v1

- Canonical op vocabulary per family: defined from corpus usage.
- Canonical system variable and function names: defined with the expression parser.
- Whether A360 per-command error options need an `errorPolicy` on actions (A-03 / A-04).
