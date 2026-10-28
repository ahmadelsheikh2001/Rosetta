# RR_02_ControlFlow

## Provenance

- Source: A360 **Community Edition** Control Room, `Bots\RPA_Rosetta_Samples`
- Retrieved: 2026-10-29, raw bot content (same retrieval as RR_01), received as `a360_02-control-flow_bot.json`
- File: `bot.json`, 12435 bytes, SHA-256 `9e25be04d6fee1c400ac43d34a96020926f2a6dfd56ab236b40563a02e695349`
  (computed in the repo; no source hash was supplied for this file)
- Encoding: ASCII-only, single line, valid JSON
- Corpus scan: clean (after fixing two scanner false positives: JSON-escaped drive paths, UUID digit groups)

## Packages and versions (from `packages`)

Boolean 2.13.3; Comment 2.17.0; Dictionary 3.16.2; File 6.16.2; If 3.8.0-20241115-115929; List 2.16.2;
Loop 3.10.0-20251030-061555; MessageBox 3.8.1; Number 3.11.5; Step 2.7.0; String 5.12.6

## Run result

Not run yet. Pending.

## Build log (as delivered during the build)

**Variables**
- vNumIn: Number, 7, input
- vTextIn: String, "Test User", input
- vResult: String, "none", output
- vFlag: Boolean, True
- vCounter: Number, 0
- vItem: String, empty
- vKey: String, empty
- vList: List of String, ["Alpha","Skip","Gamma"]
- vDict: Dictionary of String, {k1: v1, k2: v2}
- vFileInfo: Dictionary of String, no default, created from the loop's "create variable" button
- SampleNumber / SampleString: added by the A360 template

**Step 1 "Nested conditions"**
1. Comment: "RR_02: nested If / Else If / Else on Number, String and Boolean"
2. If (If.if), Number condition: `$vNumIn$` Greater Than (GT) 5
   - If (nested), String condition: `$vTextIn$` Equals (EQ) "Test User", Match case ON, Ignore carriage return OFF
     - String: Assign "Number above 5 and text matches" → vResult
   - Else (the nested If's branch)
     - String: Assign "Number above 5 but text differs" → vResult
3. Else If (If.elseIf), Boolean condition: `$vFlag$` Equals True
   - String: Assign "Flag is true" → vResult
4. Else
   - String: Assign "Else branch reached" → vResult

**Step 2 "Loops"**
5. Comment: "RR_02: loop types, with Break and Continue under If"
6. Loop, label LoopNTimes, Iterator "For n times" (loop.iterators.times), times 5, current value → vCounter
   - If, Number condition: `$vCounter$` EQ 3 → Loop: Break, label LoopNTimes
7. Loop, label LoopWhile, While, Number condition: `$vCounter$` Less Than (LT) 10, "check condition at end" OFF
   - Number: Increment `$vCounter$` by 1 → vCounter
8. Loop, label LoopListItems, "For each item in the list" (list.iterators.list), list vList, All items, current value → vItem
   - If, String condition: `$vItem$` EQ "Skip", Match case ON → Loop: Continue, label LoopListItems
   - String: Assign "Processed $vItem$" → vResult
9. Loop, label LoopDictKeys, "For each key in the dictionary" (dictionary.iterators.keys), dictionary vDict, current key → vKey
   - String: Assign "Key $vKey$ has value $vDict{$vKey$}$" → vResult (nested variable as dictionary key was accepted)
10. Loop, label LoopFiles, "For each file in folder" (loop.iterators.files, package File), folder C:\RosettaTest, assign to Dictionary vFileInfo
    - String: Assign "File found: $vFileInfo{name}$.$vFileInfo{extension}$" → vResult
11. **[DISABLED]** Message box: "Disabled on purpose: $vResult$"

**Notes from the build**
- Else / Else If are stored in the If node's `branches` array, not as siblings.
- Loop labels are stored as `anchor`; Break/Continue point to them by that label. Labels must be letters and numbers only.
- Operators are stored as codes: GT, EQ, LT.
- Everything matches the spec; the only addition is the loop labels.
