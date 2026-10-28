# ADR-013: Relative effort sizing

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

There is no structured historical effort data.

## Decision

A weighted complexity score per bot maps to S/M/L/XL. Weights, thresholds and hours per size live in the profile, flagged `calibrated: false` until tuned on the first pilot; the report shows that caveat while it is false.

## Consequences

Estimates are honest about their uncertainty and improve through calibration, not code changes.
