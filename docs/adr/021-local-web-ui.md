# ADR-021: Local web UI (`rosetta serve`)

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

The owner asked for a full UI on top of the conversion engine: choose the source and target
platform, upload the bot files, convert them and get the IBM RPA scripts back. The CLI already
does the work, but delivery teams and reviewers should not need a terminal.

Constraints from the brief: client bank bots never leave the client environment; no network
access is needed or allowed (ADR-015); the design system applies (ADR-018); tooling stays
pragmatic (no new framework or dependency without need).

## Decision

`rosetta serve` starts a small HTTP server from the CLI package (Node `http`, no framework) that
listens on **127.0.0.1 only** and serves:

- `GET /`: one self-contained page. Fonts, CSS and JavaScript are inline; nothing is
  loaded from another origin. Plain browser JavaScript, no build step, no UI library.
- `POST /api/convert`: JSON `{ source, target, files: [{ name, text }] }` → the WAL script, notes and
  static-check result per bot, reading messages per file, and the assessment report HTML. It uses
  the same steps as `rosetta convert` (read, lift, lower, `checkWal`) and `rosetta assess`.

Nothing is written to disk on the server; downloads (single files, a ZIP of everything, the report)
are created in the browser.

Security, because the files are client bots:

- Bound to 127.0.0.1, so other machines cannot reach it.
- Requests whose `Host` is not `127.0.0.1:<port>` / `localhost:<port>` are refused (DNS rebinding).
- Uploads are accepted only as `application/json`; no CORS headers are sent, so another site
  cannot post to it from the user's browser.
- Strict Content-Security-Policy (`default-src 'none'`, `connect-src 'self'`, data: fonts and images
  only), `nosniff`, `no-referrer`, `no-store`. Body limit 25 MB, 200 files per conversion.

Only A360 → IBM RPA can be chosen. Other source platforms are listed as planned and disabled, so the
UI shows the direction without promising what does not exist.

## Consequences

- The UI runs wherever the CLI runs, including inside a client environment, with no install beyond
  the CLI. It is single-user and not a hosted service; a shared server would need authentication
  and a new ADR.
- The page is in English, like the reports and the CLI.
- Zip exports from A360 are not accepted yet (A-01); the page says so.
