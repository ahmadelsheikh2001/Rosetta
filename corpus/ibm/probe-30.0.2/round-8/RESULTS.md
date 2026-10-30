# Round 8: RR_08_Parent.wal

- Date: 2026-10-30, Studio 30.0.2
- Script: from commit f93160c, opened as `Untitled 7.wal`
- Reported by the owner: a Designer screenshot and the Error List (the screenshot is not kept; its
  content is recorded here)

Error List, 2 errors, both on line 21 (`setVar --name "${vCopyCred}" --value "${vPassword}"`):

```
The variable '${vCopyCred}' is not one of the expected types: 'String'
The variable '${vPassword}' is not one of the expected types: 'String'
```

Findings:

- `setVar` does not accept SecureString variables, as target or as value. WAL has no other
  documented way to copy one, so a copy of a vault credential (A360 `Credential/assignToCV`) is
  now read again with `getVaultItem` from the same credential; anything else is a TODO. The
  static checker reports `setVar` on a SecureString.
- Accepted without errors (Designer shows them as Get Vault Item / Execute Script):
  `getVaultItem --name "DummyLogin" vPassword=password` (lines 18–19) and
  `executeScript --name "RR_08_Child" --parameters "{\"inName\":\"Test User\"}" --output "{\"outGreeting\":\"${vResult}\"}"`
  (line 20). Not run yet.
