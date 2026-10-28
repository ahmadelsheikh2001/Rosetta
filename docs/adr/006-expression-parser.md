# ADR-006: Standalone expression parser

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A360 embeds expressions in attribute values (variables, indexing, system variables, functions). This is expected to be the largest source of conversion bugs.

## Decision

A dedicated `expr` package parses source expressions into the IR expression tree. On failure it returns a `raw` expression with a reason and a diagnostic, never an exception.

## Consequences

Expression rules are tested in isolation. The exact A360 syntax must first be established from the corpus (ADR-017).
