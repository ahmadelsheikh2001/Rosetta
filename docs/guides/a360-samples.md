# Preparing A360 samples 01–04

Goal: settle every A360 assumption Phase 1 depends on ([assumptions.md](../assumptions.md)) with
as few bots as possible. Each sample is small, synthetic, and runs on Community Edition.

Command names below are descriptive. Use the closest command in the Action palette and write
the **exact** package and command name you used in `NOTES.md`; that is part of the evidence.

## Rules for every sample

- Build it in a fresh folder, e.g. `Bots/Rosetta/01-variables`.
- **Run it once** before exporting, and record the visible result (message boxes, log file
  content) in `NOTES.md`. That becomes the behaviour the converted WAL must reproduce.
- **Community Edition has no "Export bots".** Save the raw bot content instead (`GET /v2/repository/files/{id}/content`, the call the editor makes) as `bot.json`, byte-for-byte, and record its size and SHA-256 in `NOTES.md`. Where an Enterprise/partner Control Room is available, also export the bot as a zip, unchanged.
- Write `expected.wal`: how you would write the same bot by hand in IBM RPA Studio 30.0.2.
- Follow the [sanitisation checklist](../../corpus/README.md#sanitisation-checklist).
- Drop the files into `corpus/a360/<sample>/`.

### `NOTES.md` template

```markdown
# <sample>

- Control Room build / date exported:
- Packages and versions (from the bot's Dependencies / package panel):
- Export options used (dependencies included? password?):
- What it does:
- Result when run (exact message box texts, log file lines):
- Exact command names used (package → command), in order:
- Anything surprising:
```

## 01: Variables

Resolves **A-01, A-02, A-03, A-05, A-06, A-08, A-16, A-17**, and **A-15** if the export
offers a password option.

**Variables.** Declare one of each type that A360 offers (at least these). Record the exact type
names shown in the UI:

| Variable    | Type                   | Direction | Default value |
| ----------- | ---------------------- | --------- | ------------- |
| `inName`    | String                 | Input     | `Rosetta`     |
| `inCount`   | Number                 | Input     | none          |
| `outTotal`  | Number                 | Output    | `0`           |
| `isActive`  | Boolean                | local     | `True`        |
| `items`     | List (of String)       | local     | 3 values      |
| `settings`  | Dictionary (of String) | local     | 2 keys        |
| `startedAt` | Datetime               | local     | none          |
| `rows`      | Table                  | local     | none          |
| `rec`       | Record                 | local     | none          |
| `anyValue`  | Any (if offered)       | local     | none          |

Also include any other type the variable dialog lists (File, Window, Credential, ...), each with
no default. One variable per type is enough.

**Commands**, inside one **Step** named `Initialise`:

1. Assign a String, a Number and a Boolean
2. Add an item to the List; put a key into the Dictionary
3. Assign the current date/time to `startedAt`
4. Set `outTotal` from `inCount` (any simple number operation)
5. A **Comment** with a recognisable text, e.g. `ROSETTA-COMMENT-01`
6. One command **disabled**
7. A **Message box** showing a few variables
8. **Logging → Log text to file** (there is no action called "Log to file"), one line, to a generic path such as `C:\Rosetta\Output\01.log`

**Export twice** (Enterprise/partner Control Room only): once normally (`export.zip`) and once with a
password (`export-protected.zip`, put the password in NOTES.md, it's synthetic).

## 02: Control flow

Resolves **A-03, A-04, A-16**, and part of **A-07** (conditions).

Use a few local variables (String, Number, Boolean, List, Dictionary). Build:

1. **If / Else If / Else** with three branches, each showing a different message
2. A **nested If** three levels deep
3. If conditions of different kinds: String equals, Number greater than, Boolean is true, and
   **one condition combining two checks with AND and one with OR**
4. **Loops**, one of each kind the Loop command offers. At least:
   - N times
   - While a condition is true
   - For each item in a List
   - For each key/value in a Dictionary
   - For each row in a Table (a data table variable is fine; no Excel)
   - For each file in a folder (generic local folder)
5. Inside one loop: **Continue** on one condition and **Break** on another
6. **Nested Steps**: a Step inside a Step, with labels
7. One **disabled Else If branch** or a disabled command inside a branch
8. End with a message box summarising counters, so the run result is checkable

## 03: Strings and expressions

Resolves **A-07** (fully), **A-05**, and **A-09** if possible.

Assign each result to a variable and show all of them at the end (message box or log):

1. **Interpolation**: a string mixing literal text and two variables, e.g. `Hello $name$, you have $count$`
2. **List index** with a literal and with a variable index; **Dictionary key** with a literal key
3. **System variables**: current date, machine name, user name, and any others the
   insert-variable picker offers. Use at least three
4. **String commands**: substring, replace, split (into a List), trim, upper case, lower case,
   length, find/index of, compare
5. **Conversions**: String → Number, Number → String, String → Datetime, Datetime → String with
   a custom format
6. **Number operations**: increment, arithmetic with an expression (`$a$ + $b$ * 2` style), rounding
7. **Datetime**: add days, difference between two dates
8. **Special characters** in literals: a literal `$` sign, single and double quotes, a backslash
   path, a newline, a tab, an empty string, and an **Arabic text** literal (e.g. `مرحبا`)
9. Any **inline function** syntax the expression editor supports, if any

**A-09 (package versions):** if Community Edition lets you pin a different version of the String
package (or any package used here), export a second copy of this bot with the other version as
`export-pkg-<version>.zip`. If it doesn't, say so in NOTES.md; we'll leave A-09 open until a
pilot.

## 04: Error handling

Resolves **A-04** (Try/Catch/Finally) and the open IR point on per-command error options.

1. **Try / Catch / Finally** around a command that really fails (e.g. read a file that doesn't
   exist)
2. In Catch, store the **error message and line number** (whatever variables the Catch offers)
   and log them
3. **Finally** with a log line, so we can see it runs on both paths
4. **Nested Try**: an inner Try whose Catch **throws** again, caught by the outer Try
5. **Throw** a custom error with your own message
6. A Catch that lists a **specific exception type**, if the UI offers types, plus a general Catch
7. An error **inside a loop** that is caught and the loop continues
8. Any **per-command error setting** if a command offers one (e.g. "on error continue"). If
   none exists, note that
9. One **empty Catch** (it swallows the error); we need it for the `empty-catch` quality rule

## Also needed for Phase 1: a light 08

Three more assumptions block Phase 1 and are not covered above: **A-10** (vault references),
**A-13** (_Run Task Bot_) and **A-14** (dependencies in the export). The Assessment needs them for
the dependency graph and the hardcoded-credential rule.

A minimal `08-subbot-credentials` is enough:

- A child bot with one input and one output variable, doing one trivial thing
- A parent bot that calls it with **Run Task Bot**, passing the input and reading the output
- The parent reads a **dummy credential** from the Credential Vault (dummy locker and credential)
  and uses it in one command
- The parent also has a **hardcoded password literal** in one command (a fake one, e.g.
  `NotARealPassword1`), for the quality rule
- Save `bot.json` for the parent and the child. If an Enterprise/partner Control Room is available, also export the parent **with dependencies** (`export.zip`) and **without** (`export-nodeps.zip`)

The full 08 (and samples 05–07, 09) can come later: A-11 (recorder) and A-12 (Excel) were moved
to Phase 3, because the Assessment only needs package and command names, which any sample shows.

## Coverage map

| Assumption                  | 01             | 02  | 03              | 04  | 08  |
| --------------------------- | -------------- | --- | --------------- | --- | --- |
| A-01 zip layout             | ✔              |     |                 |     | ✔   |
| A-02 bot JSON structure     | ✔              | ✔   | ✔               | ✔   |     |
| A-03 node fields            | ✔              | ✔   |                 | ✔   |     |
| A-04 control-flow shape     |                | ✔   |                 | ✔   |     |
| A-05 attribute values       | ✔              |     | ✔               |     |     |
| A-06 variable declarations  | ✔              |     |                 |     | ✔   |
| A-07 expression syntax      |                | ✔   | ✔               |     |     |
| A-08 package versions       | ✔              | ✔   | ✔               | ✔   | ✔   |
| A-09 version differences    |                |     | ✔ (if possible) |     |     |
| A-10 vault references       |                |     |                 |     | ✔   |
| A-13 Run Task Bot           |                |     |                 |     | ✔   |
| A-14 dependencies in export |                |     |                 |     | ✔   |
| A-15 protected export       | ✔ (if offered) |     |                 |     |     |
| A-16 Steps and comments     | ✔              | ✔   |                 |     |     |
| A-17 encoding / other files | ✔              |     | ✔               |     |     |
