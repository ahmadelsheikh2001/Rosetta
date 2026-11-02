# Round 12: ServiceNow, SAP GUI and SAP BAPI connectors — to run in Studio 30.0.2

Status: **not run yet**. `connectors.wal` is the conversion of a synthetic A360 bot that uses every
converted command of the three packages (ADR-024). It passes `checkWal` (0 errors); the C# in each
`runCSharpCode` parses without syntax errors (tree-sitter C# grammar, 2026-11-02).

## Before opening

- Replace the `YOUR-…` values, `CLIENT_ID`, `CLIENT_SECRET`, `USER`, `PASSWORD` (test system only;
  do not commit real values).
- SAP BAPI: SAP .NET Connector 3.x (x64, .NET 4.x) installed under
  `C:\Program Files\SAP\SAP_DotNetConnector3_Net40_x64\` (or edit the `--assemblies` paths).
- SAP GUI: SAP Logon with GUI scripting enabled on client and server.

## What to record

1. Open in Studio (no run): the Error List.
2. Run section by section (ServiceNow, SAP GUI, SAP BAPI): the first failing line and its message,
   and whether `vSysId`, `vRecord`, `vList`, `vStatus`, `vCompany`, `vAddress` get values.
3. Especially: does `runCSharpCode` accept `StringDictionary<String>` as an input/output type, and
   does `httpStreamToFile` return the downloaded file path (assumption A-28).
