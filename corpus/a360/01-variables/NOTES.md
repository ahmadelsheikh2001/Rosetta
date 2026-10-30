# RR_01_Variables

## Provenance

- Source: Automation Anywhere A360 **Community Edition** Control Room, private folder `Bots\RPA_Rosetta_Samples`
- Retrieved: 2026-10-29, via `GET /v2/repository/files/{id}/content` (same call the editor makes), saved byte-for-byte with no reformatting
- Content-Type returned: `application/vnd.aa.taskbot`
- File: `bot.json`, 7508 bytes, SHA-256 `964420eb53bba473c5a9f3727119c474ac96f9c42c90f1a16586c3d7b3b10874`
  (re-checked in the repo on 2026-10-29: identical)
- Encoding: ASCII-only (UTF-8 compatible), no BOM, single line (no line breaks, so no CRLF question)
- Repository version at retrieval: 26, status NEW (never run)

## Sensitive-data check (done by hand before adding to corpus)

- No username, email, Control Room URL, user ID or tenant ID found in `bot.json`.
- The only long numbers are inside node `uid` values (random per-node IDs).
- Not included anywhere in corpus: the dependencies API response, which does contain the Control Room URL and a repository ID.

## Packages and versions (from `packages` in bot.json)

Boolean 2.13.3; Comment 2.17.0; Dictionary 3.16.2; List 2.16.2; LogToFile 3.11.1; MessageBox 3.8.1; Number 3.11.5; Step 2.7.0; String 5.12.6

`properties`: botCodeVersion "7", improvedNumberSupport true, timeout "0s", automationPriority PRIORITY_MEDIUM, runInChildWindow false, runInChildWindowMode DESKTOP. `triggers`: empty.

## View dependencies and references (Control Room UI)

- Dependencies (0), References (0). The dialog only lists other files (bots, forms and so on). It doesn't show package versions, which are in `packages` above.
- API summary: 1 entry (the bot itself), dependencyType NONE, tags INTENDED_TARGET:WINDOWS, COMPATIBLE_TARGET:WINDOWS, COMPATIBLE_TARGET:MAC_OS.

## Run result

### Run 1 (2026-10-30, Community Edition, owner's device)

Message box (`run-1/message-box.png`), title "RR_01 Variables":

```
vStr=Updated Test User | vNum=105 | vBool=false | first item=Alpha | name=Test User
```

Then the bot stopped with:

```
There was a problem at line 12
Unable to log the text to the file because the file path is not found. Verify the file path 'C:\RosettaTest\log.txt' and try again.
Location: RR_01_Variables (line 12)
Code: ba.bot.execution.error
```

Findings:

- `vNum=105`: assign 100 then increment by 5, as expected.
- `first item=Alpha`: `$vList[0]# RR_01_Variables

## Provenance

- Source: Automation Anywhere A360 **Community Edition** Control Room, private folder `Bots\RPA_Rosetta_Samples`
- Retrieved: 2026-10-29, via `GET /v2/repository/files/{id}/content` (same call the editor makes), saved byte-for-byte with no reformatting
- Content-Type returned: `application/vnd.aa.taskbot`
- File: `bot.json`, 7508 bytes, SHA-256 `964420eb53bba473c5a9f3727119c474ac96f9c42c90f1a16586c3d7b3b10874`
  (re-checked in the repo on 2026-10-29: identical)
- Encoding: ASCII-only (UTF-8 compatible), no BOM, single line (no line breaks, so no CRLF question)
- Repository version at retrieval: 26, status NEW (never run)

## Sensitive-data check (done by hand before adding to corpus)

- No username, email, Control Room URL, user ID or tenant ID found in `bot.json`.
- The only long numbers are inside node `uid` values (random per-node IDs).
- Not included anywhere in corpus: the dependencies API response, which does contain the Control Room URL and a repository ID.

## Packages and versions (from `packages` in bot.json)

Boolean 2.13.3; Comment 2.17.0; Dictionary 3.16.2; List 2.16.2; LogToFile 3.11.1; MessageBox 3.8.1; Number 3.11.5; Step 2.7.0; String 5.12.6

`properties`: botCodeVersion "7", improvedNumberSupport true, timeout "0s", automationPriority PRIORITY_MEDIUM, runInChildWindow false, runInChildWindowMode DESKTOP. `triggers`: empty.

## View dependencies and references (Control Room UI)

- Dependencies (0), References (0). The dialog only lists other files (bots, forms and so on). It doesn't show package versions, which are in `packages` above.
- API summary: 1 entry (the bot itself), dependencyType NONE, tags INTENDED_TARGET:WINDOWS, COMPATIBLE_TARGET:WINDOWS, COMPATIBLE_TARGET:MAC_OS.

 is the first item; list indexes are 0-based at runtime (A-19, A360 side).
- `vBool=false`: `$vBool.Boolean:toString# RR_01_Variables

## Provenance

- Source: Automation Anywhere A360 **Community Edition** Control Room, private folder `Bots\RPA_Rosetta_Samples`
- Retrieved: 2026-10-29, via `GET /v2/repository/files/{id}/content` (same call the editor makes), saved byte-for-byte with no reformatting
- Content-Type returned: `application/vnd.aa.taskbot`
- File: `bot.json`, 7508 bytes, SHA-256 `964420eb53bba473c5a9f3727119c474ac96f9c42c90f1a16586c3d7b3b10874`
  (re-checked in the repo on 2026-10-29: identical)
- Encoding: ASCII-only (UTF-8 compatible), no BOM, single line (no line breaks, so no CRLF question)
- Repository version at retrieval: 26, status NEW (never run)

## Sensitive-data check (done by hand before adding to corpus)

- No username, email, Control Room URL, user ID or tenant ID found in `bot.json`.
- The only long numbers are inside node `uid` values (random per-node IDs).
- Not included anywhere in corpus: the dependencies API response, which does contain the Control Room URL and a repository ID.

## Packages and versions (from `packages` in bot.json)

Boolean 2.13.3; Comment 2.17.0; Dictionary 3.16.2; List 2.16.2; LogToFile 3.11.1; MessageBox 3.8.1; Number 3.11.5; Step 2.7.0; String 5.12.6

`properties`: botCodeVersion "7", improvedNumberSupport true, timeout "0s", automationPriority PRIORITY_MEDIUM, runInChildWindow false, runInChildWindowMode DESKTOP. `triggers`: empty.

## View dependencies and references (Control Room UI)

- Dependencies (0), References (0). The dialog only lists other files (bots, forms and so on). It doesn't show package versions, which are in `packages` above.
- API summary: 1 entry (the bot itself), dependencyType NONE, tags INTENDED_TARGET:WINDOWS, COMPATIBLE_TARGET:WINDOWS, COMPATIBLE_TARGET:MAC_OS.

 renders **lower-case** `false` (A-21).
- "line 12" is the Log text to file command when every node is counted in order, Steps and Comments included (A-22).
- Log text to file does not create a missing folder. The error was environmental (`C:\RosettaTest` did not exist). Rerun pending.

## Build log (as delivered during the build)

**Variables** (name / type / default / flags)
- vStr: String, "Test User", **input**
- vNum: Number, 12345, **output**
- vBool: Boolean, True
- vDate: Datetime, 1/1/2026 09:00 AM, Africa/Cairo (stored as `2026-01-01T09:00:00+02:00[Africa/Cairo]`)
- vList: List of String, ["Alpha","Beta"]
- vDict: Dictionary of String, {name: "Test User", city: "Test City"}
- vTable: Table, 2x2, columns ColA/ColB (String), rows [A1,B1] [A2,B2]
- vCred: Credential, default set as "Insecure string" `DUMMY_TEST_VALUE`. The editor requires a default, and no vault item was picked. Kept on purpose for the hardcoded-credential rule.
- SampleNumber / SampleString: added automatically by the A360 template, left as they were.

**Step 1 "Assign new values"**
1. Comment (Comment): "RR_01: assign a new value to each variable type"
2. String: Assign (String.assign): source "Updated Test User" → vStr
3. Number: Assign (Number.assignToNumber): 100 → vNum
4. Number: Increment (Number.increment): number `$vNum$`, by 5 → vNum
5. Boolean: Assign (Boolean.assign): Constant value False → vBool
6. List: Add item (List.addItem): list vList, item = variable vStr, position End of list
7. Dictionary: Put (Dictionary.put): dict vDict, key "country", Static value, type String, value "Testland", no "previous value" output

**Step 2 "Show and log values"**
8. Comment: "RR_01: display and log selected variables"
9. Message box (MessageBox.messageBox): title "RR_01 Variables", message `vStr=$vStr$ | vNum=$vNum.Number:toString$ | vBool=$vBool.Boolean:toString$ | first item=$vList[0]$ | name=$vDict{name}$`, scrollbar 30, auto-close off
10. Logging: Log text to file (LogToFile.logToFile): path C:\RosettaTest\log.txt (stored as `file:///C:/RosettaTest/log.txt`), text `vStr=$vStr$ | vNum=$vNum.Number:toString$ | city=$vDict{city}$ | item1=$vList[1]$`, Append timestamp ON, Append to existing, ANSI
11. Logging: Log variables to file (LogToFile.logVariablesToFile): same path, Append, timestamp OFF, custom selection vBool, vDate, vNum, vStr. The names are stored in lowercase.
12. **[DISABLED]** Message box: "This action is disabled on purpose"

**Where it differs from the spec**
- There's no action called "Log to file". Used **Logging → Log text to file**, and also added **Log variables to file**.
- The Message box won't accept `$vNum$` or `$vBool$` directly (type mismatch), so the inline conversions `.Number:toString` and `.Boolean:toString` were used. `$vDate.Datetime:toString$` was rejected as an invalid expression, so vDate is only logged through "Log variables to file".
- List: Add item only takes a variable as the item, not a literal, so the item added is the value of vStr.
- No assign actions for DateTime, Table or Credential, since the spec didn't ask for them. DateTime operations are in RR_03.

### Run 2 (2026-10-30, log path changed to `D:\Rosetta\out\wal\log.txt`)

Completed. Log written (`corpus/a360/runs/2026-10-30/log.txt`, lines 1–9):

```
(10/30/2026 2:06:26 PM) vStr=Updated Test User | vNum=105 | city=Test City | item1=Beta
Task bot name : \Bots\RPA_Rosetta_Samples\RR_01_Variables

vBool (Boolean) = false
vDate (Datetime) = 2026-01-01T09:00:00+02:00[Africa/Cairo]
vNum (Number) = 105
vStr (String) = Updated Test User
----------------------------------------------------------------------------------------------------

```

Findings:

- Log text to file with timestamp prefixes `(M/d/yyyy h:mm:ss AM/PM) ` to the line.
- Log variables to file writes `Task bot name : <repository path>`, an empty line, one
  `name (Type) = value` line per variable in alphabetical order, a line of 100 dashes and an empty line.
- `item1=Beta`: `$vList[1]$` is the second item (0-based, confirmed again).
