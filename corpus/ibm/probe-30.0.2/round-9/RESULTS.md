# Round 9: RR_08_Parent.wal, RR_08_Child.wal and 05-excel.wal run

- Date: 2026-10-30, Studio 30.0.2
- Scripts: from commit 477d9a6 (round 8 fix applied); `RR_08_Child.wal` saved under that name,
  IBM vault credential `DummyLogin` created by the owner (test value, not recorded)
- Reported by the owner: both bots ran; "everything is the same" as A360

## RR_08_Parent

Opened with 0 errors and ran. Message box (title "Automation Anywhere Enterprise Client"):

```
Result: Hello Test User
```

Same text as the A360 run (corpus/a360/08-subbot-credentials/NOTES.md). The screenshot is not kept;
the text above is all it shows. Verified:

- `executeScript --name "RR_08_Child"` finds the saved child script by name; `--parameters` and
  `--output` as JSON pass `inName` in and bring `outGreeting` back into `vResult`.
- `getVaultItem --name "DummyLogin" var=password` reads the IBM vault without error (also for the
  copy that replaced `setVar`, round 8).

## 05-excel

Ran to the end. `C:\RosettaTest\log.txt` as delivered:

```
Name=Alice Amount=100
Name=Bob Amount=200
Name=Carol Amount=300
```

Same lines as one A360 run. Verified:

- `excelOpen`, `excelGetTable --getfirstsheet --entiretable --hasheaders` (the header row is not a
  data row), `for` over the `rows` output, and `mapTableRow` **by column name**
  (`"name=Name=${vRow_Name},name=Amount=${vRow_Amount}"`), which the reference does not show.
- Numbers read as text give `100`, like A360 READ_CELL_TEXT.
- `excelSet` and `excelClose --save` ran without error. `Done` in C1 not reported separately.
