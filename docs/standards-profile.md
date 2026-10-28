# Standards profile

Schema: [`packages/standards/src/profile.ts`](../packages/standards/src/profile.ts).
Built-in defaults: [`packages/standards/src/defaults.ts`](../packages/standards/src/defaults.ts). Decision: ADR-008.

A profile describes how generated bots must look and how source bots are judged.
Layers are merged in this order, later layers winning:

1. built-in defaults (generic IBM RPA best practices)
2. company profile (from the internal conventions document)
3. client profile (a bank's own conventions, when they impose them)
4. project overrides, `rosetta.project.yaml` (ADR-009)

Merging rules (`resolveProfile` / `loadProfile` in `packages/standards/src/layers.ts`):

- Objects merge key by key; **lists and single values replace** the lower layer's value.
- A layer only needs the keys it changes; an empty file changes nothing.
- The merged result is validated once. Every problem names the layer and file that caused it,
  e.g. `company profile (profiles/company.yaml) at "logging.format": Invalid input: expected string`.
- `provenance` tells which layer set each value (useful to answer "why is this 16 h?").

`rosetta.project.yaml` wraps its layer: `version: 1` and `standards: { ... }`. Manual conversion
decisions (renames, exception classification) are added to it with the converter.

Try a profile without real exports: `rosetta preview-report --profile company.yaml`.

## Sections

| Section      | Controls                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `naming`     | Case style for variables and subroutines, optional type-aware prefixes, script name pattern                 |
| `header`     | Fields in the header comment of every generated script                                                      |
| `config`     | Abstract config mechanism (`configFile`, `scriptParameters`, `serverParameters`) and what values to extract |
| `logging`    | Log line format, step-boundary logging; business values only when annotated                                 |
| `errors`     | Default exception category, screenshot on system error, transparent wrappers                                |
| `behavioral` | Opt-in flags for behavioral transforms. All `false` by default                                              |
| `quality`    | Each rule's enabled flag and severity; nesting depth; comment threshold; Quality Score penalties            |
| `stages`     | Names of the standard stages (initialization, processing, end)                                              |
| `sizing`     | Complexity weights, S/M/L thresholds, hours per size, `calibrated` flag                                     |

Profiles are strict: an unknown key is an error, so typos surface immediately.

## Example (company profile, partial)

```yaml
profile: company
version: 1
naming:
  variable:
    case: camelCase
    typePrefix: { string: str, number: num, boolean: bln, table: dt }
logging:
  format: '[{stage}] [{level}] {message}'
sizing:
  hoursPerSize: { S: 6, M: 16, L: 40, XL: 80 }
```
