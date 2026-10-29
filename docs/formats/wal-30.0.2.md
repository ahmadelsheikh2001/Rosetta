# IBM RPA WAL (Studio 30.0.2)

Script syntax used by the generator, with its source (ADR-017, ADR-019). Command-by-command
conversion: [`docs/mappings/a360-to-ibm-rpa.md`](../mappings/a360-to-ibm-rpa.md).

Sources:

- **Round 1**: Studio 30.0.2 opening generated `04-error-handling.wal`
  (`corpus/ibm/probe-30.0.2/round-1`).
- **Toolbox**: screenshots of every toolbox category in Studio 30.0.2 (`corpus/ibm/toolbox-30.0.2`).
- **Docs**: IBM RPA 30.0.x command reference, `https://www.ibm.com/docs/en/rpa/30.0.x`.

## General syntax (docs: "Script mode")

```
commandVerb --inputparameter "value" <output_variable>=outputparameter
```

- One command per line. Comments: `// text` (verified, round 1).
- Variable reference: `${name}` (verified). Environment variables: `${rpa:errorMessage}`,
  `${rpa:errorLineNumber}`, `${rpa:scriptName}` (docs: "Environment variables").
- String values in double quotes. **Backslash is an escape character** (verified: `C:\RosettaTest`
  displayed as `C:RosettaTest`): write `C:\\RosettaTest`. Quotes inside values: `\"` (docs examples).
- Number values unquoted (verified: a quoted reference for a Numeric target gives "Not a number").
- Boolean flags are written alone to enable them: `--allowdecimalpoint` (docs examples).
- Outputs: `target=value` after the inputs, e.g. `getStringLength --text "${t}" len=value`.
- Studio opens a script with unknown commands and lists each error with its line (verified, W-16).

## Variables (docs: "Define Variable")

`defVar --name(String) --type(String) [--innertype(String)] [--value(Variant)] [--parameter] [--output] [--required]`

- Types verified in round 1: String, Numeric, Boolean, DataTable.
- Documented: List / Stack / Queue / StringDictionary with `--innertype`; list default
  `--value "[a,b,c]"`; DateTime default `"2019-08-05 12:18:18"`; SecureString; StringKeyValuePair.

## Flow control (docs: Flow Control commands)

| Construct        | Syntax                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| If               | `if --left … --operator "…" [--right …] [--negate]` … `elseIf …` … `else` … `endIf`                                                                                                                                                   |
| Operators        | `Equal_To`, `Greater_Than`, `Greater_Than_Equal_To`, `Less_Than`, `Less_Than_Equal_To`, `Contains`, `Begins_With`, `Ends_With`, `Matches`, `Is_True`, `Is_Empty`, `Is_Null`, `Is_Null_Or_Empty` (names from docs; `Is_True` verified) |
| For              | `for --variable ${i} --from 1 --to 5 --step 1` … `next`                                                                                                                                                                               |
| While            | `while --left … --operator … --right …` … `endWhile`                                                                                                                                                                                  |
| Do-While         | `do` … `loopWhile --left … --operator … --right …`                                                                                                                                                                                    |
| For Each         | `foreach --collection "${c}" --variable "${item}" [--distinct]` … `endFor`                                                                                                                                                            |
| Break / Continue | `break` (Interrupt Loop), `continue`                                                                                                                                                                                                  |
| Subroutines      | `goSub --label name [--assignments …]`; `beginSub --name name` … `endSub`; `return`                                                                                                                                                   |

## Error handling (docs: Handle Error, Exception handling scope, Raising your own exceptions)

- `onError [--executenext] --label handler`: watches the subroutine it is called in (and the
  subroutines it calls) until that subroutine ends or another `onError` runs.
- The handler is a subroutine that **must** end with `recover` (continue with the command after the
  failing one) or `stopExecution`; otherwise the runtime raises a new error.
- `failTest --message "…"` raises an exception that `onError` catches (verified that it exists).
- There is **no** `tryCatch` / `catch` / `endTryCatch` (refuted, round 1).

## Commands used by the generator

| Verb                    | Syntax (docs)                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setVar`                | `setVar --name "${x}" --value …` (verified)                                                                                                                                     |
| `writeToFile`           | `writeToFile --value(String) [--createrandomfile] --file(String) --encoding(EncodingType) [--overwrite] [--writeasnewline] (String)=value` (`--value --file` verified)          |
| `readCSV`               | `readCSV --filepath(String) --delimiter(String) --hasheaders(Boolean) [--encoding] [--missingfieldaction] (DataTable)=value (Numeric)=rows (Numeric)=columns` (exists, round 1) |
| `getSubString`          | `getSubString --text(String) --start(Numeric) [--length(Numeric)] (String)=value`                                                                                               |
| `trimString`            | `trimString --text(String) --trimoption(TrimOptions) (String)=value`                                                                                                            |
| `replaceText`           | `replaceText --texttoparse(String) [--useregex] --pattern(String) [--regexOptions] --textpattern(String) [--replacement(String)] (String)=value`                                |
| `splitString`           | `splitString --text(String) --delimiteroption(DelimiterOptions) … --customdelimiter(String) … (List<String>)=value`                                                             |
| `changeTextCase`        | `changeTextCase --text(String) --type(TextCaseType) (String)=value`                                                                                                             |
| `getStringLength`       | `getStringLength --text(String) (Numeric)=value`                                                                                                                                |
| `parseText`             | `parseText --text(String) [--useRegex] --query(String) --regexPattern(String) [--regexOptions] --startindex(Numeric) (Numeric)=value` (1-based: docs example returns 64)        |
| `convertStringToNumber` | `convertStringToNumber --text(String) [--allowleadingsign] [--allowdecimalpoint] [--allowthousands] … --culture(Culture) (Numeric)=value`                                       |
| `convertNumberToText`   | `convertNumberToText --number(Numeric) --conversiontype(ConversionType) --decimals(Numeric) [--usethousandseparator] [--culture] (String)=value`                                |
| `incrementVar`          | `incrementVar --number(Numeric)`                                                                                                                                                |
| `evaluate`              | `evaluate --expression "${a}/${b}" result=value`                                                                                                                                |
| `getCurrentDateAndTime` | `getCurrentDateAndTime --localorutc(LocalOrUtcOptions) [--getcurrentdateonly] (DateTime)=value`                                                                                 |
| `addToDateTime`         | `addToDateTime --date(DateTime) --value(Numeric) --type(DateType) (DateTime)=value`                                                                                             |
| `dateTimeToText`        | `dateTimeToText [--culture] --date(DateTime) [--usecustomformat] --customformat(String) --standardformat(…) (String)=value`                                                     |
| `add`                   | `add --collection(List) --value(Variant)`                                                                                                                                       |
| `strDictAdd`            | `strDictAdd [--usevariable] --keyvalue(…) --key(String) --value(String) --dictionary(StringDictionary)`                                                                         |
| `messageBox`            | `messageBox --title --text --icon --buttons --defaultbutton (String)=value`                                                                                                     |
| `getEnvVar`             | `getEnvVar --name(String) --target(SystemEnvironmentVariables) (String)=value`                                                                                                  |
| `logMessage`            | `logMessage --message "…" --type "Info"` (not generated yet)                                                                                                                    |

## Open

- List and dictionary element access inside values (`${list[1]}`, `${dict[key]}`), and the list index
  base (A-19).
- Property access on key-value pairs (`${entry.Key}`).
- Whether a subroutine call resets or keeps an outer `onError` after it returns (nested Try).
