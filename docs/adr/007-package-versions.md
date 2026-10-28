# ADR-007: Package versions are part of the Source Model

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A360 is cloud-based and its command packages are versioned; attribute names may differ between versions.

## Decision

Record the package name and version for every bot in the Source Model and carry them into the IR (`Bot.packages`). Mappings may later be qualified by version range.

## Consequences

The Assessment report can show the package versions in use. Version-specific behaviour is explicit instead of guessed.
