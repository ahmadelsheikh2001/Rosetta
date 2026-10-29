# Round 1: 04-error-handling.wal in IBM RPA Studio

- Date: 2026-10-29
- Studio: IBM Robotic Process Automation Studio (30.0.2 per project target; exact build not recorded yet)
- Script tested: `04-error-handling.tested.wal` (as generated before round 1, saved here unchanged)
- Evidence: `04-error-handling-studio.png` (Designer view and Error List)
- Opened as: tab "Untitled 2.wal" (to confirm: opened from file or pasted)

## Error List (9 errors, 0 warnings)

| Line | Error |
| ---- | ----- |
| 21 | The command 'tryCatch' does not exist |
| 22 | The command 'tryCatch' does not exist |
| 24 | The parameter 'delimiter' is required and was not specified |
| 25 | The command 'catch' does not exist |
| 27 | Not a number |
| 29 | The command 'endTryCatch' does not exist |
| 33 | The command 'catch' does not exist |
| 35 | Not a number |
| 37 | The command 'endTryCatch' does not exist |

## Accepted (no error on these lines)

- `defVar` with `--type` String, Numeric, Boolean, DataTable and `--value`, `--parameter`, `--output` (lines 10–18)
- `setVar --name "${x}" --value "…"`, shown as "Assign Variable" (line 26, 34)
- `${wdg:error.Message}` shown as a variable reference (line 34)
- `writeToFile --value … --file …`, shown as "Write to File … using encoding Operating System Default" (line 36)
- `if --left "${vDoThrow}" --operator "Is_True"` / `endIf`, `failTest --message` (lines 30–32)
- `//` comment lines, shown as comments (line 38)

## Observed without an error

- The file path `"C:\RosettaTest\log.txt"` is shown as `C:RosettaTestlog.txt`: backslash is an escape
  character in WAL strings.

## Changes made after this round

- Backslashes in quoted values are doubled.
- Number values from a reference are written without quotes (`--value ${wdg:error.LineNumber}`).
- `tryCatch` / `catch` / `endTryCatch` are no longer written; Try/Catch markers and catch bodies are
  kept as comments until the WAL error-handling construct is known.
