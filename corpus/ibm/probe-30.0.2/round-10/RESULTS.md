# Round 10: 09-web-form.wal

- Date: 2026-10-31, Studio 30.0.2
- Script: from commit 4e53d24, opened as `Untitled 8.wal`. The owner put the real practice-page
  address and CSV path back before opening it (the corpus copy is sanitized).
- Reported by the owner: a Designer screenshot and the Error List (the screenshot is not kept: it
  shows the machine address, the page address and the local user path).

Error List, 1 error and 1 warning, both on line 29 (`webStart --name browser --type "Chrome"`):

```
Error    The parameter 'userprofilepreferences' is required and was not specified
Warning  Command 'webStart' must be closed with 'webClose'
```

Findings:

- `--userprofilepreferences` is required by Studio 30.0.2, although the 30.0.x reference marks it
  optional. The generator writes `--userprofilepreferences "AutomationOptimized"` ("Default for
  automation", the documented option that ignores the user's browser profile, like an A360 new
  window).
- Every `webStart` needs a `webClose`. A360 leaves the browser open at the end, so the generator
  writes `webClose --name browser --leavebrowseropen` at the end of the main flow.
- Accepted without errors: `webNavigate`, `readCSV --hasheaders`, `for … --to ${table.Rows}`,
  `mapTableRow` with column names containing spaces, `webSet`, `webSetComboBox
  --selectoptionby "MatchByText"`, `webClick`, all with `--selector "Id" --id … --timeout "00:00:15"`.
- The static checker now reports both findings. Not run yet.
