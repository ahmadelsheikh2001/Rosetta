# RR_08_Parent and RR_08_Child (sub-bot and vault credential)

## Provenance

- Source: A360 **Community Edition** Control Room, private workspace, `Bots\RPA_Rosetta_Samples`
- Built: 2026-10-30 in the Task Bot editor by the browser agent (same method as RR_01..RR_04)
- Retrieved: `GET /v2/repository/files/{id}/content`, saved byte for byte
- Files are named after the A360 bots, so the converted child is `RR_08_Child.wal`, the name the
  parent's `executeScript` calls
- Encoding: ASCII-only, single line, no trailing newline, valid JSON
- Corpus scan: clean

| File                | Repository id | Bytes | SHA-256                                                            |
| ------------------- | ------------- | ----- | ------------------------------------------------------------------ |
| `RR_08_Child.json`  | 16816933      | 1086  | `14a55a74b61207da09d77bef2198fbfb2daf39f606fed86c95d0905f14b92814` |
| `RR_08_Parent.json` | 16816937      | 3339  | `155d07d5b32f40d07de89369be760cd69e5ab38299f558ea43e41de6c27daf72` |

Hashes match the ones reported by the agent; recomputed in the repo.

## Vault entry (synthetic)

Locker `RosettaTest`, credential `DummyLogin`, attribute `password`, created by hand in the
Control Room (the agent may not type passwords). The test value is **not** in any file: the bot
JSON stores only the locker / credential / attribute names.

## RR_08_Child

Packages: String 5.12.6. Variables: `inName` STRING input, `outGreeting` STRING output (both
default "").

| #   | Editor action  | packageName / commandName | Key attributes                                                           |
| --- | -------------- | ------------------------- | ------------------------------------------------------------------------ |
| 1   | String: Assign | `String` / `assign`       | `sourceString` expression `Hello $inName$`; `returnTo` VARIABLE `outGreeting` |

## RR_08_Parent

Packages: TaskBot 2.10.0-20241119-100739, Credential 1.8.0, String 5.12.6, MessageBox 3.8.1.

Variables:

- `vResult`, `vCopy`, `vHardcoded`: STRING, default ""
- `vPassword`: CREDENTIAL, default `{ lockerName: RosettaTest, name: DummyLogin, attributeName: password }`
- `vCopyCred`: CREDENTIAL, same vault default (see findings)

| #   | Editor action      | packageName / commandName  | Key attributes                                                                                                                                                                                                        |
| --- | ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Task Bot: Run      | `TaskBot` / `runTask`      | `taskbotFile` `repository:///Automation%20Anywhere/Bots/RPA_Rosetta_Samples/RR_08_Child`; `taskbotInput` DICTIONARY `inName` = "Test User"; DO_NOT_REPEAT; `continueOnError` false; `returnTo` DICTIONARY `outGreeting` → `vResult` |
| 2   | Credential: Assign | `Credential` / `assignToCV` | `stringVar` CREDENTIAL expression `$vPassword$`; `returnTo` VARIABLE `vCopyCred`                                                                                                                                     |
| 3   | String: Assign     | `String` / `assign`        | `sourceString` literal `NotARealPassword1` (test literal, not a real password); `returnTo` `vHardcoded`                                                                                                              |
| 4   | Message box        | `MessageBox` / `messageBox` | `content` expression `Result: $vResult$`; default title; `scrollLines` 30; `closeMsgBox` false                                                                                                                      |

## Findings from the build

- The child is referenced by URL-encoded repository path, not by id. Inputs and outputs are
  DICTIONARY values keyed by the child's variable names (A-13).
- A vault reference is `{ type: CREDENTIAL, credential: { lockerName, name, attributeName } }` (A-10).
  The editor requires a default for every Credential variable.
- **The requested "credential into a String variable" step is not possible**: String: Assign
  rejects `$vPassword$` ("Invalid expression ... Variable not found") and the String variable
  picker does not list Credential variables. The closest action is Credential: Assign
  (`Credential/assignToCV`), whose target must be a Credential, so `vCopyCred` was added. `vCopy`
  stays a String variable that is never assigned.
- `vHardcoded` holds a literal in a plain String variable; nothing in the JSON marks it as a
  secret, so the hardcoded-credential rule (Credential variables only) does not flag it.

## Run result

Not run yet. **Expected**: a message box `Result: Hello Test User`.
