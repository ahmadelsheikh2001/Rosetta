# ADR-018: Brand and design system

- **Status:** Accepted (amended 2026-11-09: the product carries only its own name, RPA Rosetta; no company name or logo)
- **Date:** 2026-10-28

## Context

RPA Rosetta is shown to clients. Every visual output (the Phase 1 HTML report, the Web UI) must follow one design system, from a single source.

## Decision

Brand rules live as **design tokens** in `packages/design-tokens`, consumed by `report` now and by any Web UI later. Nothing visual hardcodes a colour, font or spacing.

### Colours (exact HEX)

- **Primary** (used at all times): Black Blue `#02021E`, Oxford Blue `#001944`, Charcoal `#2B3E51`, Bice Blue `#0071B4`, Dodger Blue `#0094F7`, Anti-Flash White `#EBEFF0`.
- **Secondary** (only for differentiation in content-heavy views, never as main colours): Smoky Black `#110C01`, Cafe Noir `#442B00`, Dark Cafe `#513E2B`, Rust `#B44300`, Spanish Orange `#F76300`, Isabelline `#F0ECEB`.
- Tints (a palette colour mixed toward white) are allowed for backgrounds, text and visuals.
- **White `#FFFFFF`** is allowed (B-03). White is used for the report page background and cards; Anti-Flash White for subtle section backgrounds.
- No other colours without updating this ADR. A unit test pins the HEX values and checks that every semantic token resolves to a palette colour or a tint of one.

### Typography

- **Montserrat** for body and informative text: Light 300, Regular 400, Medium 500, Bold 700. SemiBold 600 only for subheadings, signposting or differentiation inside body text.
- **Chakra Petch** for headlines and accent text: Light 300, Medium 500, Bold 700.
- Headlines are UPPERCASE with letter-spacing `0.1em` (tracking 100).
- Text is always left-aligned; body copy is sentence case.
- Fonts are bundled locally from their open-licence distributions. No Google Fonts CDN and no external request of any kind (ADR-015).

### Name

The report masthead and the web UI header show the product name, **RPA Rosetta**, as text. No company name and no logo image is shown.

### Semantic roles

| Role                   | Token                           |
| ---------------------- | ------------------------------- |
| Page background, cards | White                           |
| Section background     | Anti-Flash White                |
| Text                   | Black Blue; muted text Charcoal |
| Headings               | Oxford Blue                     |
| Accent                 | Bice Blue                       |
| Interactive            | Dodger Blue                     |

### Status colours (B-02)

The palettes contain no green or red, so two statuses use the secondary palette, which is allowed for differentiation in content-heavy views such as the report.

| Status                     | Colour         | Icon  |
| -------------------------- | -------------- | ----- |
| Auto-converted / OK        | Dodger Blue    | check |
| Needs review               | Spanish Orange | eye   |
| Blocked / unmapped / error | Rust           | block |
| Informational              | Bice Blue      | info  |

A status is **never shown by colour alone**: it is always paired with its icon and a text label from the string catalog (`status.*`).

## Consequences

The report and future UI look consistent by construction. Any brand change is a token change plus its test.
