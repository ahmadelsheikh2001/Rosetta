# ADR-024: ServiceNow, SAP GUI and SAP BAPI converted by hand

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The tiered fallback (ADR-023) gave ServiceNow REST templates with placeholder endpoints, SAP GUI
generic drafts, and SAP BAPI stubs: IBM RPA has no ServiceNow, BAPI or RFC command.

## Decision

`packages/target-wal/src/connectors.ts` converts the three packages before the fallback:

- **ServiceNow** — OAuth password grant (`/oauth_token.do`), bearer header dictionary per session,
  Table API (`POST/GET/PATCH/DELETE /api/now/table/{table}`), Attachment API
  (`/api/now/attachment`), JSON bodies built from A360 dictionaries with `runCSharpCode`, results
  read with `mapJson` / `jsonToTable`. Triggers become a scheduling note (Control Center polling).
- **SAP GUI** — `startSAPSession` from the SAP Logon entry, `click --doubleclick / --rightbutton`,
  virtual keys in SendKeys notation; field commands stay generated drafts on SAP GUI scripting ids.
- **SAP BAPI** — IBM RPA calls SAP through **SAP .NET Connector 3.x** in `runCSharpCode`
  (`--assemblies` sapnco.dll, `--input` / `--output` JSON bindings per the 30.0.x reference). Each
  `runCSharpCode` is isolated, so Connect / Create function / Set field are collected and written as
  **one** call at Run function (with `BAPI_TRANSACTION_COMMIT` when asked); it returns every export
  parameter, structure and table as JSON, and Get field / Get table / Get structure read it with
  `mapJson` / `jsonToTable`. Workflows run their BAPI the same way.

## Consequences

- No stubs left in these packages for bots that follow the A360 order (connect → … → run → get).
- Needs SAP NCo 3.x on the bot machine; A360 used SAP JCo (Java). Assumption A-28 (Studio round 12).
