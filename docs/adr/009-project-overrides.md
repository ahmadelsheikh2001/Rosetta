# ADR-009: Project overrides file for deterministic re-runs

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Migration developers will refine results: renames, business-value annotations, exception classification, mapping corrections. Hand edits to generated WAL are lost on the next run.

## Decision

Each migration project has a `rosetta.project.yaml` holding all manual decisions. It is the last profile layer and is read on every run.

## Consequences

Conversion is repeatable and decisions are reviewable in pull requests. The overrides schema must stay backward compatible or be migrated.
