# ADR-010: Two-dimensional report with externalised strings

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The report serves both management and developers, and may later need Arabic.

## Decision

- Two dimensions, **Conversion** and **Quality**, on both the **Source** and **Output** sides, plus a Source Quality Score per bot and per portfolio.
- Layout: a one-page management summary (portfolio size, coverage, quality score, effort by size), then drill-down per bot, with each finding anchored to its source node.
- Formats: JSON (machine) and HTML (people). Visual design follows ADR-018.
- Diagnostics store a `messageId` plus params, never text; all strings live in a catalog (`en` for the MVP).

## Consequences

Adding a language means adding a catalog, with no logic changes.
