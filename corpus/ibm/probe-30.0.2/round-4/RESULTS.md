# Round 4: first run of a converted bot (03-strings-expressions.wal)

- Date: 2026-10-30
- Script: `03-strings-expressions.wal` from commit 53d1958, pasted as "Untitled 3.wal" and **run** in Studio 30.0.2
- Evidence: message box seen in the session; screenshot not kept (it shows the server machine name)

## Message box "RR_03 Expressions" (machine name redacted)

```
part0=${vParts[1]} | list1=${vList[2]} | name=${vDict[name]} | date=06/11/2026 | len=18 | idx=7 |
out=Machine=<server> | Bot=Untitled 3.wal | CR={{ROSETTA: a360:AAControlRoom}}
```

## Compared with the A360 run of the same bot (corpus/a360/03-strings-expressions/NOTES.md)

| Value | A360 | IBM RPA | Result |
| --- | --- | --- | --- |
| date (today + 7 days, dd/MM/yyyy) | 06/11/2026 | 06/11/2026 | same |
| len (trim then length) | 18 | 18 | same |
| idx (find "Rosetta", case-insensitive) | 7 | 7 | same: both 1-based |
| Machine | owner's desktop | Studio server | expected: the machine running the bot |
| Bot | `\Bots\RPA_Rosetta_Samples\RR_03_StringsExpressions` | `Untitled 3.wal` | differs (A-23) |
| CR | Control Room URL | placeholder | no equivalent (known) |
| part0 / list1 / name | Hello / Beta / Test User | `${vParts[1]}` / `${vList[2]}` / `${vDict[name]}` printed literally | **WAL does not interpolate element access** |

So trimString, getStringLength, parseText (regex + IgnoreCase), getCurrentDateAndTime, addToDateTime,
dateTimeToText, getEnvVar, ${rpa:scriptName} and messageBox ran and produced the A360 values.

## Changes made after this round

- List items are read with `get --collection --index n` (Get List Item, 1-based: A360 index + 1) and dictionary
  values with `strDictGet --key --dictionary` into helper variables, written right before the statement.
- A test checks that no `${name[…]}` is written outside comments.
