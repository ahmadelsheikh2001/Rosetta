import {
  logoClearSpace,
  resolveColor,
  semanticColors,
  statuses,
  tint,
  toCss,
  type Status,
} from '@rosetta/design-tokens';

/** Rendered logo width in the masthead, px. Clear space is derived from it (ADR-018). */
export const LOGO_WIDTH = 168;

/** Light tints of the status colours for chip backgrounds; tints are allowed by the guidebook. */
function statusVars(): string {
  return (Object.keys(statuses) as Status[])
    .map((s) => {
      const role = semanticColors[statuses[s].color];
      return [
        `  --status-${s}: ${resolveColor(role)};`,
        `  --status-${s}-bg: ${tint(role.color, 0.88)};`,
      ].join('\n');
    })
    .join('\n');
}

/**
 * Report layout. Every colour is a token variable from `@rosetta/design-tokens`;
 * this sheet adds no colour of its own (checked by test).
 */
const layout = `
* { box-sizing: border-box; }
html { font-size: 16px; -webkit-text-size-adjust: 100%; }
body { margin: 0; font-size: var(--font-size-sm); line-height: 1.5; }
h1, h2, h3 { margin: 0; line-height: 1.25; }
h1 { font-size: var(--font-size-xl); }
h2 { font-size: var(--font-size-lg); }
h3 { font-size: var(--font-size-sm); font-weight: 500; }
p { margin: 0; }
a { color: var(--color-accent); }
.wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
.muted { color: var(--color-text-muted); }
.num { font-variant-numeric: tabular-nums; }
.icon { flex: none; vertical-align: -3px; }
.sub { font-weight: 600; }

/* Masthead: Oxford Blue takes the white logo (ADR-018) */
.masthead { background: var(--vs-oxford-blue); color: var(--vs-white); }
.masthead .wrap { display: flex; align-items: center; gap: 24px; padding-top: 8px; padding-bottom: 8px; flex-wrap: wrap; }
.logo-space { padding: var(--logo-clear); }
.logo-placeholder {
  width: var(--logo-width); height: 40px; display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--vs-white); color: var(--vs-white); font-size: var(--font-size-xs);
}
.masthead .titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.masthead .product { font-family: var(--font-headline); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: var(--font-size-lg); overflow-wrap: anywhere; }
.masthead .subtitle { font-size: var(--font-size-xs); opacity: 0.85; }

/* Synthetic data banner */
.banner { background: var(--status-review-bg); border-bottom: 2px solid var(--status-review); }
.banner .wrap { display: flex; gap: 12px; align-items: flex-start; padding-top: 12px; padding-bottom: 12px; }
.banner .icon { color: var(--status-review); margin-top: 3px; }
.banner strong { font-family: var(--font-headline); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; display: block; }
.banner .wrap > div, .masthead .titles { min-width: 0; }

nav.toc { background: var(--color-section); border-bottom: 1px solid var(--color-border); }
nav.toc .wrap { display: flex; gap: 20px; padding-top: 10px; padding-bottom: 10px; flex-wrap: wrap; }
nav.toc a { color: var(--color-heading); text-decoration: none; font-weight: 500; }
nav.toc a:hover { color: var(--color-interactive); }

main .wrap { padding-top: 32px; padding-bottom: 48px; }
section.page { margin-bottom: 48px; }
.section-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }

.grid { display: grid; gap: 16px; }
.kpis { grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); margin-bottom: 16px; }
.two { grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); margin-bottom: 16px; align-items: start; }

.card { background: var(--color-surface); border: 1px solid var(--color-border); padding: 20px; min-width: 0; overflow-wrap: anywhere; }
.card h3 { margin-bottom: 4px; }
.card .caption { margin-bottom: 16px; }
.band { background: var(--color-section); padding: 16px; margin-bottom: 16px; }

.kpi .label { color: var(--color-text-muted); font-weight: 500; }
.kpi .value { font-family: var(--font-headline); font-weight: 700; font-size: var(--font-size-xxl); color: var(--color-heading); line-height: 1.1; margin: 6px 0 4px; }
.kpi .value small { font-size: var(--font-size-md); font-weight: 500; }
.kpi .note { color: var(--color-text-muted); font-size: var(--font-size-xs); }

/* Stacked coverage bar: 2px surface gaps between segments, 4px rounded ends */
.stack { display: flex; gap: 2px; height: 20px; background: var(--color-surface); }
.stack .seg { min-width: 2px; }
.stack .seg:first-child { border-radius: 4px 0 0 4px; }
.stack .seg:last-child { border-radius: 0 4px 4px 0; }
.stack .seg:only-child { border-radius: 4px; }
.seg.auto, .swatch.auto { background: var(--status-auto); }
.seg.review, .swatch.review { background: var(--status-review); }
.seg.blocked, .swatch.blocked { background: var(--status-blocked); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; padding: 0; list-style: none; }
.legend li { display: flex; align-items: center; gap: 8px; }
.swatch { width: 12px; height: 12px; border-radius: 2px; flex: none; }

/* Effort bars: one series, one hue */
.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 32px 1fr 120px; gap: 12px; align-items: center; }
.bar-track { height: 16px; }
.bar { height: 16px; background: var(--color-accent); border-radius: 0 4px 4px 0; min-width: 2px; }
.bar-row .size { font-family: var(--font-headline); font-weight: 700; }

table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 600; color: var(--color-text-muted); font-size: var(--font-size-xs); padding: 8px 10px; border-bottom: 1px solid var(--color-border); }
td { padding: 8px 10px; border-bottom: 1px solid var(--color-border); vertical-align: top; }
td.num, th.num { text-align: left; }
tr:hover td { background: var(--color-section); }
.table-scroll { overflow-x: auto; }
code { font-family: Consolas, 'Courier New', monospace; font-size: var(--font-size-xs); word-break: break-all; }

.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 2px; font-weight: 500; white-space: nowrap; }
.chip.auto { background: var(--status-auto-bg); }
.chip.review { background: var(--status-review-bg); }
.chip.blocked { background: var(--status-blocked-bg); }
.chip.info { background: var(--status-info-bg); }
.chip.auto .icon { color: var(--status-auto); }
.chip.review .icon { color: var(--status-review); }
.chip.blocked .icon { color: var(--status-blocked); }
.chip.info .icon { color: var(--status-info); }
.size-tag { font-family: var(--font-headline); font-weight: 700; }

.bot-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid var(--color-heading); }
.bot-head .meta { display: flex; flex-direction: column; gap: 4px; }
.metrics { grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); }
.block { margin-top: 16px; }

footer { border-top: 1px solid var(--color-border); }
footer .wrap { padding-top: 16px; padding-bottom: 24px; color: var(--color-text-muted); font-size: var(--font-size-xs); }

@media (max-width: 640px) {
  .wrap { padding: 0 16px; }
  .two { grid-template-columns: 1fr; }
  .bar-row { grid-template-columns: 24px 1fr auto; }
  .card { padding: 16px; }
  .masthead .product { font-size: var(--font-size-md); }
}

@media print {
  @page { size: A4; margin: 14mm 12mm; }
  html { font-size: 12px; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  nav.toc { display: none; }
  main .wrap, .wrap { max-width: none; padding-left: 0; padding-right: 0; }
  section.bot { break-before: page; }
  .card, .band, tr, .kpi { break-inside: avoid; }
  thead { display: table-header-group; }
  tr:hover td { background: none; }
  a { color: inherit; text-decoration: none; }
  .table-scroll { overflow: visible; }
}
`;

/** Layout CSS only (no tokens), exported for the no-hardcoded-colour test. */
export const layoutCss = layout;

/** Full stylesheet: token variables, status tints, layout. */
export function reportCss(): string {
  return [
    toCss(),
    ':root {',
    statusVars(),
    `  --logo-width: ${LOGO_WIDTH}px;`,
    `  --logo-clear: ${logoClearSpace(LOGO_WIDTH)}px;`,
    '}',
    layout,
  ].join('\n');
}
