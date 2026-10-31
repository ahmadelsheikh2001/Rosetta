# RR_05_Excel

## Provenance

- Source: A360 **Community Edition** Control Room, private workspace, `Bots\RPA_Rosetta_Samples`
- Built: 2026-10-30 in the Task Bot editor by the browser agent (same method as RR_01..RR_04)
- Retrieved: `GET /v2/repository/files/{id}/content` (repository id 16816934), saved byte for byte
- File: `bot.json`, 4124 bytes, SHA-256 `3fe7d93b6ad00aee96bf2788f199022a0da02bc42a3ab0b3e012e44e433b4d72`:
  revision 2 (2026-10-30 21:16 UTC), which writes `Done` to C2. Revision 1 (SHA-256 `452b7e4a…0b213e`)
  wrote C1 and stopped at Set cell: A360 refuses a header-row cell when "Sheet contains a header"
  is on. Revision 2 differs only in that cell; its hash, reported by the agent from the Control
  Room on 2026-10-31, was reproduced here from revision 1 with C1 → C2.
- Encoding: ASCII-only, single line, no trailing newline, valid JSON
- Corpus scan: clean
- Test data: `C:\RosettaTest\input.xlsx`, synthetic (Name / Amount: Alice 100, Bob 200, Carol 300),
  made with `ZipArchive` without Excel

## Packages and versions (from `packages`)

Excel_MS 6.23.20 (shown as "Excel advanced"); LogToFile 3.11.1; Loop 3.10.0-20251030-061555

## Variables

- `vRow`: RECORD, default empty record (`{ schema: [], values: [] }`), created before the loop
- `SampleNumber` / `SampleString`: editor defaults

## Actions

| #   | Editor action                                       | packageName / commandName           | Key attributes                                                                                                                                                                                         |
| --- | --------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Excel advanced: Open                                | `Excel_MS` / `OpenSpreadsheet`      | `excelSourceOption` desktopfilepath; `filePath` FILE `file:///C:/RosettaTest/input.xlsx`; `containsHeader` true; `isSpecificSheet` false; `fileAccessMode` EDIT; `returnTo` SESSION `Default` (LOCAL) |
| 2   | Loop, "Excel advanced: For each row in worksheet"   | `Loop` / `loop.commands.start`      | `loopType` ITERATOR; iterator `loop.iterators.excel` (Excel_MS): `loopSelection` ALL_ROWS, `readOption` READ_CELL_TEXT, `session` Default; `returnTo` VARIABLE `vRow`                                  |
| 3   | (in loop) Logging: Log text to file                 | `LogToFile` / `logToFile`           | `filePath` `file:///C:/RosettaTest/log.txt`; `logContent` `Name=$vRow{Name}$ Amount=$vRow{Amount}$`; no timestamp; APPEND_FILE; ANSI                                                                   |
| 4   | Excel advanced: Set cell                            | `Excel_MS` / `SetCell`              | `cellOption` SPECIFIC_CELL; `cell` C2; `value` Done; `session` Default                                                                                                                                 |
| 5   | Excel advanced: Save workbook                       | `Excel_MS` / `SaveSpreadSheet`      | `session` Default; `isDisplayErrorEnabled` false                                                                                                                                                       |
| 6   | Excel advanced: Close                               | `Excel_MS` / `CloseSpreadsheet`     | `session` Default; `isSave` true; `isDisplayErrorEnabled` false                                                                                                                                        |

## Findings from the build

- The "Excel advanced" package is `Excel_MS` in the JSON (A-12).
- The session is declared in the Open action's `returnTo` (type SESSION), not as an attribute;
  the other actions carry a `session` attribute of type SESSION.
- The row loop is the generic `Loop` package with the Excel_MS iterator `loop.iterators.excel`.
  The defaults ALL_ROWS and READ_CELL_TEXT ("Read visible text in cell") are stored explicitly.
- Record columns are read as `$vRow{Name}$`, the same syntax as a dictionary key.
- Close saves by default (`isSave` true), so the workbook is saved twice (Save workbook, then
  Close). The conversion saves once, on close (noted).

## Run result

### Run 1 (2026-10-30, A360 Community Edition)

`C:\RosettaTest\log.txt` as delivered:

```
Name=Alice Amount=100
Name=Bob Amount=200
Name=Carol Amount=300
Name=Alice Amount=100
Name=Bob Amount=200
Name=Carol Amount=300
```

Findings:

- The header row is skipped (`containsHeader` true) and columns are read by header name.
- Numbers come back as their visible text (`100`, not `100.0`): READ_CELL_TEXT.
- The three rows appear twice. The log appends (`APPEND_FILE`), so this is most likely two runs;
  to confirm with an empty `log.txt`. If one run wrote six lines, the loop ran twice.
- `Done` in C2 of `input.xlsx` (revision 2). C1 is in the header row: A360 stops the bot there
  ("Unable to set the value in the specified cell because it is in the header row").
