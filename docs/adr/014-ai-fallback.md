# ADR-014: AI fallback is off by default, local-capable and always flagged

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Client bank bots must not leave the client environment; cloud LLM use depends on company policy.

## Decision

- Disabled by default; enabled per run.
- Provider-agnostic interface that supports a local model.
- Inputs are redacted; the model receives the available target commands from the registry.
- Suggestions are parsed and validated, and always reported as "suggested, needs review". They are never trusted silently.

## Consequences

Planned for Phase 5. No network code exists until then.
