# ADR-015: CLI first, fully offline

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Bank data must stay on the machine running the tool, and batch processing of many bots is the main use.

## Decision

The first interface is a CLI. The tool makes no network requests, and a test enforces this. Any later Web UI is a thin layer over the same core.

## Consequences

Easy to run inside client environments and in CI. Report assets (fonts, logo) must be bundled locally (ADR-018).
