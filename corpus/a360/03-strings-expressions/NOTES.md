# RR_03_StringsExpressions

## Provenance

- Source: A360 **Community Edition** Control Room, `Bots\RPA_Rosetta_Samples`
- Retrieved: 2026-10-29, raw bot content (same retrieval as RR_01), received as `a360_03-strings-expressions_bot.json`
- File: `bot.json`, 10270 bytes, SHA-256 `05097bc861614a369aaa6f593e7b210499a4edbb890a13d2f965b1a2fe14ca5b`
  (computed in the repo; no source hash was supplied for this file)
- Encoding: ASCII-only, single line, valid JSON
- Corpus scan: clean

## Packages and versions (from `packages`)

Comment 2.17.0; Datetime 2.17.3; MessageBox 3.8.1; Number 3.11.5; Step 2.7.0; String 5.12.6; System 3.18.2

## Run result

Not run yet. Pending.

## Not covered yet (from docs/guides/a360-samples.md, item 8)

Literal `$` sign, quotes, backslash in an expression, newline, tab, empty string in an expression, Arabic text.
Needed to close A-07 (escaping) and A-17 (non-ASCII encoding).

## Build log (as delivered during the build)

**Variables**
- vText: String, "␣␣Hello Rosetta Test␣␣" (2 spaces at each end), input
- vOut: String, "none", output
- vNumStr: String, "42"
- vDateStr: String, empty
- vNum, vIndex, vLen: Number, 0
- vDate: Datetime, no default
- vParts: List of String, empty
- vList: List of String, ["Alpha","Beta"]
- vDict: Dictionary of String, {name: "Test User"}
- SampleNumber / SampleString: added by the template

**Step 1 "String operations"** (all in package String)
1. Assign (String.assign): `Prefix-$vText$-$vNumStr$-Suffix` → vOut
2. Trim (String.trim): `$vText$`, trim beginning ON, trim end ON → vText
3. Substring (String.subString): `$vText$`, start 1, length 5, "return blank if range not found" OFF → vOut
4. Replace (String.replace): `$vText$`, find "Rosetta", replace with "IBM", not case sensitive, not regex, start 1, count -1 → vOut
5. Split (String.split): `$vText$`, delimiter = a single space, not case sensitive, all substrings → vParts
6. Uppercase (String.uppercase): `$vText$` → vOut
7. Lowercase (String.lowercase): `$vText$` → vOut
8. Find (String.find): `$vText$`, find "Rosetta", not case sensitive, not regex, start 1 → vIndex
9. Length (String.length): `$vText$` → vLen

**Step 2 "Conversions and dates"**
10. Comment: "RR_03: number/string conversions and datetime add + custom format"
11. String: To number (String.toNumber): `$vNumStr$` → vNum
12. Number: To string (Number.toString): `$vNum$`, digits after decimal 0 → vOut
13. Datetime: Assign (Datetime.assign): option "Variable", source `$System:Date$` → vDate ("get current date"; there is no dedicated "now" action)
14. Datetime: Add (Datetime.add): `$vDate$`, value 7, unit DAYS → vDate
15. Datetime: To string (Datetime.toString): `$vDate$`, Custom format dd/MM/yyyy → vDateStr

**Step 3 "System variables and expressions"**
16. Comment: "RR_03: system variables plus list index and dictionary key expressions"
17. String: Assign `Machine=$System:Machine$ | Bot=$System:AATaskName$ | CR=$System:AAControlRoom$` → vOut
18. Message box: title "RR_03 Expressions", message `part0=$vParts[0]$ | list1=$vList[1]$ | name=$vDict{name}$ | date=$vDateStr$ | len=$vLen.Number:toString$ | idx=$vIndex.Number:toString$ | out=$vOut$`
19. **[DISABLED]** Message box: `Disabled on purpose: $vList[0]$`

**Notes from the build**
- System variables used 4 times: Date, Machine, AATaskName, AAControlRoom. A360 has no "BotName"; AATaskName is the closest.
- Step 1 has no Comment. The bot has 2 Comments in total, in Steps 2 and 3.
- Message box text is stored as `expression`; plain literals as `string`.
- Index base: Substring and Find start counting at 1 by default, list indexes like `$vList[0]$` start at 0.

## Run result

### Run 1 (2026-10-30)

Message box "RR_03 Expressions" (machine name and Control Room URL redacted):

```
part0=Hello | list1=Beta | name=Test User | date=06/11/2026 | len=18 | idx=7 |
out=Machine=<machine> | Bot=\Bots\RPA_Rosetta_Samples\RR_03_StringsExpressions | CR=<control-room-url>
```

Findings:

- Trim worked (`len=18` for "Hello Rosetta Test"); split by space, `$vParts[0]$` = `Hello`.
- `$System:Date$` + 7 days formatted `dd/MM/yyyy` = `06/11/2026` (run on 2026-10-30).
- **String/find is 1-based**: `idx=7` for "Rosetta" in "Hello Rosetta Test" (A-19).
- **`$System:AATaskName$` is the repository path** `\Bots\<folder>\<bot>`, not just the bot name (A-23).
- `$System:AAControlRoom$` is the Control Room URL with a trailing slash.
