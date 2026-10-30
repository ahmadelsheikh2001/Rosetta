# A360 → IBM RPA command map

How every A360 construct seen in the corpus is converted, and what has no IBM equivalent.
Implementation: [`packages/target-wal/src`](../../packages/target-wal/src). WAL syntax details and
sources: [`docs/formats/wal-30.0.2.md`](../formats/wal-30.0.2.md).

**Evidence levels**

- **Verified**: accepted by IBM RPA Studio 30.0.2 (round 1, `corpus/ibm/probe-30.0.2/round-1`).
- **Documented**: syntax from the IBM RPA 30.0.x command reference and the command is present in the
  Studio toolbox (`corpus/ibm/toolbox-30.0.2`). To confirm in Studio.
- **No equivalent**: IBM has no matching command or value; the conversion writes a `TODO [ROSETTA]`
  comment or a visible `{{ROSETTA: …}}` placeholder and lists it in `<bot>.notes.md`.

## Commands

| A360 package / command               | IBM toolbox command                   | WAL verb                              | Evidence                                     | Conversion notes                                                                                                      |
| ------------------------------------ | ------------------------------------- | ------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| String / assign                      | Assign Variable                       | `setVar`                              | Verified                                     |                                                                                                                       |
| Number / assignToNumber              | Assign Variable                       | `setVar`                              | Verified                                     | Number value written bare                                                                                             |
| Boolean / assign                     | Assign Variable                       | `setVar`                              | Verified                                     | `True` / `False`                                                                                                      |
| Number / increment                   | Increment Variable / Evaluate         | `incrementVar`, `evaluate`            | Documented                                   | `incrementVar` when the step is 1 and the target is the source, else `evaluate --expression "${x} + n"`               |
| Number / toString                    | Convert Number to Text                | `convertNumberToText`                 | Documented                                   | `--conversiontype "SimpleNumber" --decimals n` (round 2: "Number" is rejected)                                        |
| String / toNumber                    | Convert Text to Number                | `convertStringToNumber`               | Documented                                   | `--culture en-US`, sign and decimal point allowed                                                                     |
| String / trim                        | Trim Text Blanks                      | `trimString`                          | Documented                                   | `TrimStart`, `TrimEnd`, `TrimStartAndEnd`                                                                             |
| String / subString                   | Get Subtext                           | `getSubString`                        | Documented                                   | Start index base to confirm (A-19)                                                                                    |
| String / replace                     | Replace Text                          | `replaceText`                         | Documented                                   | A360 case-insensitive → `--useregex` with the escaped literal and `IgnoreCase`                                        |
| String / split                       | Split Text                            | `splitString`                         | Documented                                   | `CustomDelimiter`                                                                                                     |
| String / uppercase, lowercase        | Change Text Case                      | `changeTextCase`                      | Documented                                   | `--type "Upper"` / `"Lower"`                                                                                          |
| String / find                        | Find Occurrences in Text              | `parseText`                           | Documented                                   | 1-based like A360; case-insensitive via regex + `IgnoreCase`                                                          |
| String / length                      | Count Text Characters                 | `getStringLength`                     | Documented                                   |                                                                                                                       |
| Datetime / assign (`$System:Date$`)  | Get Current Date and Time             | `getCurrentDateAndTime`               | Documented                                   | `--localorutc "LocalTime"`                                                                                            |
| Datetime / add                       | Add Value to Date Time                | `addToDateTime`                       | Documented                                   | Units Days, Hours, Minutes, Months, Seconds, Years                                                                    |
| Datetime / toString (custom)         | Convert Date Time to Text             | `dateTimeToText`                      | Documented                                   | `--usecustomformat --customformat "dd/MM/yyyy"`                                                                       |
| List / addItem (end)                 | Add to Collection                     | `add`                                 | Documented                                   | Other positions: manual                                                                                               |
| Dictionary / put                     | Add to String Dictionary              | `strDictAdd`                          | Documented                                   | Static value only                                                                                                     |
| MessageBox / messageBox              | Show Message Box                      | `messageBox`                          | Documented                                   | Auto-close has no equivalent (noted)                                                                                  |
| LogToFile / logToFile                | Write to File                         | `writeToFile`                         | Verified (`--value --file`), rest documented | Appends by default; `--writeasnewline`; A360 timestamp prefix not reproduced (noted)                                  |
| LogToFile / logVariablesToFile       | Write to File                         | `writeToFile`                         | Documented                                   | No direct equivalent: written as `name=value` pairs (noted)                                                           |
| CsvTxt / OpenCSVTXT + ReadFromCsvTxt | Read CSV File                         | `readCSV`                             | Exists (round 1), syntax documented          | Two A360 commands become one; `--delimiter ","`                                                                       |
| Excel_MS / OpenSpreadsheet           | Open Excel File                       | `excelOpen`                           | Documented                                   | Session → `Excel` variable `rosettaExcel<session>`; desktop file only; read-only mode noted                           |
| Excel_MS / SetCell (specific cell)   | Set Value in Excel                    | `excelSet`                            | Documented                                   | `--getfirstsheet --usingcell --cell`; A360 uses the active sheet (noted)                                              |
| Excel_MS / SaveSpreadSheet           | none for an Excel instance            | (comment)                             | Documented (`officeSave` is for Office apps) | Saved on close with `excelClose --save` (noted)                                                                       |
| Excel_MS / CloseSpreadsheet          | Close Excel                           | `excelClose`                          | Documented                                   | `--save` when A360 saves on close or saved earlier                                                                    |
| Loop + `loop.iterators.excel`        | Get Excel Table + For + Map Table Row | `excelGetTable`, `for`, `mapTableRow` | Documented                                   | Sheet read once before the loop; one String variable per column read (`vRow_Name`); mapping by column name to confirm |
| TaskBot / runTask                    | Execute Script                        | `executeScript`                       | Documented                                   | `--name "<child bot>"`, inputs/outputs as JSON; publish the child under that name (noted)                             |
| Credential / assignToCV              | Get Vault Item                        | `getVaultItem`                        | Round 8                                      | `setVar` rejects SecureString (round 8): a copy of a vault credential is read from the vault again; otherwise manual  |

## Control flow

| A360                        | WAL                                                                                  | Evidence                                            |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| If / Else If / Else         | `if` / `elseIf` / `else` / `endIf`                                                   | `if`, `endIf`, `Is_True` verified; rest documented  |
| Conditions EQ, GT, LT       | `Equal_To`, `Greater_Than`, `Less_Than`                                              | Documented                                          |
| Boolean "is true"           | `--operator "Is_True"` (`--negate` for false)                                        | Verified                                            |
| Loop n times                | `for --variable ${i} --from 1 --to n --step 1` / `next`                              | Documented                                          |
| Loop while                  | `while` / `endWhile`; do-while → `do` / `loopWhile`                                  | Documented                                          |
| Loop each item in list      | `foreach --collection --variable` / `endFor`                                         | Documented                                          |
| Loop each key in dictionary | `foreach` over the StringDictionary into a `StringKeyValuePair`, then `${entry.Key}` | Documented; `.Key` property to confirm              |
| Loop each file in folder    | `getFiles` exists, but returns paths, not A360's name/extension dictionary           | Not converted yet (manual)                          |
| Break / Continue            | `break` (Interrupt Loop) / `continue`                                                | Documented. Labelled break to an outer loop: manual |
| Step                        | `// ---- Step name ----` comment                                                     | Verified (comments)                                 |
| Comment                     | `// text`                                                                            | Verified                                            |
| Disabled command            | Kept as `// [DISABLED] …` comment, listed in notes                                   | Verified (comments)                                 |

## Error handling

IBM RPA has **no try/catch command** (`tryCatch` was rejected by Studio in round 1). Errors are
handled with **Handle Error** (`onError`), which watches the subroutine it is called in, and an
error-handling subroutine that must end with **Recover From Error** (`recover`) or **Stop Execution**.

A360 Try / Catch / Finally is converted as:

```
setVar --name "${rosettaTry1Failed}" --value False      // main flow
goSub --label Try1
<Finally commands>                                       // run after the block, error or not

beginSub --name Try1                                     // A360 Try body
onError --label Catch1
<command>
if --left "${rosettaTry1Failed}" --operator "Is_True"    // after every command:
return                                                   //   leave the block after an error,
endIf                                                    //   like A360 does
endSub

beginSub --name Catch1                                   // A360 Catch body
setVar --name "${rosettaTry1Failed}" --value True
setVar --name "${vErrMsg}" --value "${rpa:errorMessage}"
setVar --name "${vErrLine}" --value ${rpa:errorLineNumber}
<Catch commands>
recover
endSub
```

Why the flag: `recover` resumes at the command **after** the one that failed, while A360 skips the
rest of the Try block. The flag check returns from the protected subroutine instead.

| A360                            | WAL                                                         | Evidence                                 |
| ------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| Throw                           | `failTest --message` (Throw Exception; caught by `onError`) | Verified (accepted), catching documented |
| Catch error message / line      | `${rpa:errorMessage}` / `${rpa:errorLineNumber}`            | Documented (environment variables)       |
| Catch a specific exception type | `onError` catches every error                               | Noted when A360 filters by type          |
| Several Catch blocks            | Only the first is converted                                 | Manual                                   |
| Try / Finally without Catch     | Finally does not run after an error                         | Manual                                   |

## System variables

| A360                                 | WAL                                                                                          | Evidence                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `$System:Date$` (in Datetime assign) | `getCurrentDateAndTime`                                                                      | Documented                         |
| `$System:AATaskName$`                | `${rpa:scriptName}`                                                                          | Documented (environment variables) |
| `$System:Machine$`                   | `getEnvVar --name COMPUTERNAME --target "Process"` into a helper variable, once at the start | Documented                         |
| `$System:AAControlRoom$`             | **No equivalent**                                                                            | Placeholder + manual note          |

## Variables

| A360 type                      | WAL `defVar --type`                                                                                                                               | Evidence                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| STRING, NUMBER, BOOLEAN, TABLE | String, Numeric, Boolean, DataTable                                                                                                               | Verified                                                   |
| DATETIME                       | DateTime                                                                                                                                          | Documented. A360 zoned default values are not carried over |
| LIST (subtype)                 | List `--innertype …`; default `--value "[a,b]"`                                                                                                   | Documented                                                 |
| DICTIONARY (subtype)           | StringDictionary `--innertype …`; defaults added with `strDictAdd`                                                                                | Documented                                                 |
| CREDENTIAL                     | SecureString, **never with a value**: read it from the vault (Get Vault Item)                                                                     | Documented                                                 |
| CREDENTIAL (vault reference)   | `getVaultItem --name "<credential>" var=password` at the start; the IBM vault has no lockers (noted); attributes other than `password` are manual | Documented                                                 |
| RECORD                         | No record type: one String variable per column read, `<record>_<column>`                                                                          | Documented (Map Table Row)                                 |
| input / output                 | `--parameter` / `--output`                                                                                                                        | Verified                                                   |

## Not covered yet

Commands from samples not built yet (browser, email, database, terminal, other Excel commands).
Their IBM toolbox equivalents exist (see `corpus/ibm/toolbox-30.0.2`) and are mapped when the
samples arrive.
