# A360 bot file (task bot JSON)

Verified from the corpus (ADR-017). Evidence: `corpus/a360/0N-*/bot.json`, referred to as **01–04**.
Source: Community Edition Control Room, raw content of `GET /v2/repository/files/{id}/content`
(Content-Type `application/vnd.aa.taskbot`). The official **export zip** (manifest, dependencies) is
not covered here: Community Edition has no export (A-01, A-14, A-15 stay open).

Survey: 4 bots, 81 nodes, 33 distinct commands in 20 packages.

## File

- One JSON object on a single line, ASCII-only in all four samples, no BOM (A-17, partly: no
  non-ASCII sample yet).
- Top-level keys, identical in 01–04: `triggers`, `nodes`, `variables`, `packages`, `properties`,
  `workItemTemplateName`.
  - `triggers`: empty in all samples.
  - `packages`: `[{ name, version, settingsAttributes: [] }]`, one entry per package used (A-08).
    Versions are SemVer, sometimes with a build suffix: `3.8.0-20241115-115929`.
  - `properties`: `botCodeVersion` (`"7"`), `improvedNumberSupport`, `timeout` (`"0s"`),
    `automationPriority`, `runInChildWindow`, `runInChildWindowMode`.
  - `workItemTemplateName`: `null`.

## Nodes (A-02, A-03)

Every node has `uid` (UUID), `commandName`, `packageName` and `disabled` (boolean, present on all 81
nodes, including branch nodes). Optional:

| Key          | Holds                                                         | Seen in |
| ------------ | ------------------------------------------------------------- | ------- |
| `attributes` | Command parameters, `[{ name, value }]`                       | 01–04   |
| `children`   | Nested block (Step body, If/Loop/Try body)                    | 01–04   |
| `branches`   | Sibling blocks of a control node (see below)                  | 02, 04  |
| `returnTo`   | Output variable, `{ type: VARIABLE, variableName }`           | 01–04   |
| `returns`    | Named outputs, e.g. Catch `{ errorMessage, errorLineNumber }` | 04      |
| `anchor`     | Loop label, `{ type: STRING, string }`                        | 02      |

A disabled node is a normal node with `disabled: true` (01, 02, 03, 04: one each).

## Control flow (A-04)

| Construct        | Representation                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Step             | `Step/step`, `children`, attribute `title` (01–04)                                                                             |
| Comment          | `Comment/Comment`, attribute `comment` (01–04)                                                                                 |
| If               | `If/if`, `children` = then-block, attribute `condition`; `branches` = ordered `If/elseIf` (own `condition`) and `If/else` (02) |
| Loop             | `Loop/loop.commands.start`, `anchor` = label, attribute `loopType`: `ITERATOR` or `WHILE` (02)                                 |
| Loop, iterator   | attribute `iterator` with `value.iteratorName`, nested `attributes`, and `returnTo` = current item (02)                        |
| Loop, while      | attribute `condition` and `checkConditionAtEnd` (02)                                                                           |
| Break / Continue | `Loop/loop.commands.break` / `loop.commands.continue`, attribute `anchor` = label of the target loop (02)                      |
| Try              | `ErrorHandler/try`, `children` = body; `branches` = `ErrorHandler/catch` nodes then optional `ErrorHandler/finally` (04)       |
| Catch            | attributes `exceptionType` (`EXCEPTION`), `continueOnError`; `returns.errorMessage`, `returns.errorLineNumber` (04)            |
| Throw            | `ErrorHandler/throw`, attributes `message`, `exceptionType` (04)                                                               |

Iterators seen: `loop.iterators.times` (Loop), `list.iterators.list` (List),
`dictionary.iterators.keys` (Dictionary), `loop.iterators.files` (File). Note the iterator's
package can differ from `Loop`.

Exception type seen: `BotException` (shown as "AllErrors" in the UI).

## Attributes

`{ name, value }`, or for conditions and iterators `{ name, value, attributes: [...] }`
(+ `returnTo` for iterators). Attribute names are used exactly as stored, including the
misspelling `delimeter` in `CsvTxt/OpenCSVTXT` (04).

Conditions: `value: { type: CONDITIONAL, conditionalName, packageName }` with nested attributes
`variable`, `operator`, `value` and type-specific options (`matchCase`, `isIgnoreCarriage`).
`conditionalName` seen: `stringVariable` (String), `numberVariable` (Number), `booleanVariable` (Boolean).
Operators are codes: `EQ`, `GT`, `LT` (02, 04).

## Values (A-05)

`{ type, <payload> }`. Shapes found:

| `type`        | Payload key(s)                                                                                    | Notes                              |
| ------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `STRING`      | `string` (literal) **or** `expression` (contains `$…$`)                                           | 01–04                              |
| `NUMBER`      | `number` **as a string** (`"5"`, `"-1"`) or `expression`                                          | 01–04                              |
| `BOOLEAN`     | `boolean` or `expression`                                                                         | 01–04                              |
| `DATETIME`    | `string` (ISO with zone, e.g. `2026-01-01T09:00:00+02:00[Africa/Cairo]`, or `""`) or `expression` | 01, 03                             |
| `FILE`        | `string` (`file:///C:/…`) or `expression` (`file://$vFilePath$`)                                  | 01, 04: URI form, not a plain path |
| `VARIABLE`    | `variableName`                                                                                    | 01–04                              |
| `VARIABLEMAP` | `variableMapNames` (lower-cased names)                                                            | 01                                 |
| `LIST`        | `list`: values                                                                                    | 01–03                              |
| `DICTIONARY`  | `dictionary`: `[{ key, value, entryType }]`                                                       | 01–03                              |
| `TABLE`       | `table`: `{ schema: [{ name?, type }], rows: [{ values }] }`                                      | 01, 04                             |
| `CONDITIONAL` | `conditionalName`, `packageName`                                                                  | 02, 04                             |
| `ITERATOR`    | `iteratorName`, `packageName`                                                                     | 02                                 |
| `EXCEPTION`   | `exceptionName`, `packageName`                                                                    | 04                                 |

Watch out:

- Some flags are booleans stored as `STRING`: `isCaseSensitive`, `isRegularExpression` = `"false"`
  (03), `Boolean/assign` `userDefined` = `"false"` (01). The value's `type` is not the semantic type.
- `string` vs `expression` is the only signal that a value is dynamic.

## Variables (A-06)

`{ name, type, subtype?, description?, readOnly, input, output, defaultValue? }`.

- Types seen: `STRING`, `NUMBER`, `BOOLEAN`, `DATETIME`, `LIST` / `DICTIONARY` (with `subtype`,
  e.g. `STRING`), `TABLE`, `CREDENTIAL`. Template variables `SampleNumber` / `SampleString` carry
  `subtype: UNDEFINED` and no `defaultValue`.
- Direction: `input` / `output` booleans (no `inout` seen).
- `CREDENTIAL` with an insecure literal default: `defaultValue: { type: STRING, string: "…" }` (01).
  This is the shape the hardcoded-credential rule looks for. **A vault reference has not been seen
  yet** (A-10).
- `VARIABLEMAP` stores names lower-cased (`vbool` for `vBool`), which suggests names are
  case-insensitive. Not confirmed.

## Expressions (A-07, partly)

Inside `expression` strings, dynamic parts are `$…$`:

| Form                 | Example                                                                              | Seen       |
| -------------------- | ------------------------------------------------------------------------------------ | ---------- |
| Variable             | `$vStr$`                                                                             | 01–04      |
| List index (0-based) | `$vList[0]$`                                                                         | 01, 03     |
| Dictionary key       | `$vDict{name}$`                                                                      | 01–03      |
| **Nested** key       | `$vDict{$vKey$}$`                                                                    | 02         |
| Inline conversion    | `$vNum.Number:toString$`, `$vBool.Boolean:toString$`                                 | 01, 03, 04 |
| System variable      | `$System:Date$`, `$System:Machine$`, `$System:AATaskName$`, `$System:AAControlRoom$` | 03         |
| Text template        | `Prefix-$vText$-$vNumStr$-Suffix`                                                    | 01–04      |
| URI prefix           | `file://$vFilePath$`                                                                 | 04         |

- Because `$…$` nests inside `{…}` (and presumably `[…]`), a tokenizer that splits on `$` is wrong;
  the parser must track brackets.
- `$vDate.Datetime:toString$` was rejected by the editor (build log 01): inline conversions are not
  available for every type.
- **Not yet covered:** a literal `$`, quotes, backslashes inside expressions, newline/tab, empty
  expressions, non-ASCII text. A-07 stays open for escaping.

## Index bases

- List index in expressions: 0-based (`$vList[0]$` is the first item).
- `String/subString` and `String/find` `startIndex` default to `1` (03): 1-based. To be confirmed by
  running RR_03.

## Steps and comments (A-16)

Steps are nodes with a `title` attribute and `children`; comments are nodes with a `comment`
attribute. Both appear wherever statements can (01–04).
