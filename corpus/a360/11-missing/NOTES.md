# RR_11_Missing

## Provenance

- Source: A360 Community Edition Control Room, `Bots\RPA_Rosetta_Samples`, repository id 16818103
- Built: 2026-11-01 in the Task Bot editor by the browser agent, synthetic values only
- Retrieved: the `GET /v2/repository/files/{id}/content` response the editor loads, saved byte for byte
- File: `bot.json`, 7691 bytes, ASCII, SHA-256 `00d4298c31034075dc929014343a2732bc1fcfa9bb26b9b304604709cc939aa2`
  (matches the hash reported by the agent; recomputed in the repo)
- Purpose: the A360 shapes needed to convert hand-written IBM RPA scripts back to A360 (A-26)

## Packages and versions

File 6.16.2; JavaScript 2.18.3; MessageBox 3.8.1; Number 3.11.5; OCR 2.18.3; PDF 3.11.0;
String 5.12.6; TaskBot 2.10.0-20241119-100739

## Actions

| #   | Action                    | Package / command                                                         | Notes                                                                                   |
| --- | ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | File: Copy                | `File` / `copyFiles`                                                      | `sourceFilePath` FILE URI; `destinationPath` plain STRING; `isOverwrite`                |
| 2–3 | String: Find (regex)      | `String` / `find`                                                         | `isRegularExpression` "true", `isCaseSensitive` "false"; result to a NUMBER variable    |
| 4–6 | JavaScript: Open/Run/Close | `JavaScript` / `javascript.commands.openScript`, `executeFunction`, `closeScript` | Run takes one parameters variable (a LIST, one item per function parameter); session "Default" |
| 7   | PDF: Extract text         | `PDF` / `extractText`                                                     | writes to a `.txt` file only (`outputFile`), not to a variable                          |
| 8   | OCR: Capture text by path | `OCR` / `captureImagebyPath`                                              | `imagePathOption` "Image Path"; result to a STRING variable                             |
| 9   | Number: Assign            | `Number` / `assignToNumber`                                               | arithmetic expression `$vPos$ * 10 / 2` accepted by the editor (no marker)              |
| 10  | String: Assign            | `String` / `assign`                                                       | `$vCols[$vCol$]$$vRow.Number:toString$` accepted by the editor (list item by number)     |
| 11  | Message box               | `MessageBox` / `messageBox`                                               | **editor error "Invalid expression"**: NUMBER variables in text without `.Number:toString` |
| 12  | Task Bot: Stop            | `TaskBot` / `stopTask`                                                    | no attributes                                                                           |

## Findings

- The bot does not run: A360 refuses "Automation with errors" because of line 11. The error is the
  sample's, kept on purpose; `checkA360` now reports a NUMBER or BOOLEAN variable inside text.
- Lines 9 and 10 show no marker in the editor; whether they compute as expected is not run yet
  (A-26). Expected values: pos=9, pos2=0, match=0042, calc=45, cell=C7.
