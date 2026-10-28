# ADR-012: Exceptions are system exceptions by default

- **Status:** Accepted (pending company convention)
- **Date:** 2026-10-28

## Context

A360 does not distinguish business from system exceptions natively, so the distinction cannot be inferred reliably.

## Decision

Every exception is `system` unless classified as `business` in the project overrides. How a business exception is signalled in WAL follows the company convention once documented.

## Consequences

Business-exception handling is a deliberate, reviewed decision, never a guess.
