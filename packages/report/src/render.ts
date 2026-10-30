import type {
  AssessmentResult,
  BotAssessment,
  Coverage,
  CoverageBucket,
  RankedItem,
} from '@rosetta/assessment';
import type { Status } from '@rosetta/design-tokens';
import type { Diagnostic, Severity, SourceRef } from '@rosetta/ir';
import { en, translate, type Catalog, type MessageId } from './catalog.js';
import { anchor, esc } from './escape.js';
import { fontFaceCss } from './fonts.js';
import { logoDataUri, logoHeight } from './logo.js';
import { icon } from './icons.js';
import { LOGO_WIDTH, reportCss } from './styles.js';

export interface RenderOptions {
  readonly catalog?: Catalog;
  /** BCP 47 tag for `<html lang>` and number formatting. */
  readonly locale?: string;
}

const severityStatus: Record<Severity, Status> = {
  error: 'blocked',
  warning: 'review',
  info: 'info',
};
const bucketStatus: Record<CoverageBucket, Status> = {
  mapped: 'auto',
  partial: 'review',
  manual: 'blocked',
};
const buckets: readonly CoverageBucket[] = ['mapped', 'partial', 'manual'];

/** Renders an assessment as one self-contained, offline HTML document. */
export function renderHtml(result: AssessmentResult, options: RenderOptions = {}): string {
  const catalog = options.catalog ?? en;
  const locale = options.locale ?? 'en';
  const t = (id: MessageId | (string & {}), params?: Record<string, string | number>) =>
    esc(translate(catalog, id, params, locale));
  const n = (value: number) => esc(value.toLocaleString(locale));
  const when = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
  };

  const chip = (status: Status, label: string) =>
    `<span class="chip ${status}">${icon(status)}<span>${label}</span></span>`;

  const location = (source: SourceRef | undefined, isBotLevel: boolean) => {
    if (!source || isBotLevel) return t('location.bot');
    const path = source.nodePath.map((i) => i + 1).join(' › ');
    const parts = [
      source.label ? esc(source.label) : '',
      path ? t('location.node', { path }) : '',
    ].filter(Boolean);
    return parts.join(' · ') || t('location.bot');
  };

  const coverageBar = (c: Coverage) => {
    const segs = buckets
      .filter((b) => c[b] > 0)
      .map((b) => {
        const pct = (c[b] / c.total) * 100;
        const label = `${translate(catalog, `bucket.${b}`)}: ${c[b]} (${pct.toFixed(1)} %)`;
        return `<div class="seg ${bucketStatus[b]}" style="flex: ${c[b]} 0 0" title="${esc(label)}" role="img" aria-label="${esc(label)}"></div>`;
      })
      .join('');
    const legend = buckets
      .map(
        (b) =>
          `<li><span class="swatch ${bucketStatus[b]}"></span><span>${t(`bucket.${b}`)} <span class="num muted">${n(c[b])}</span></span></li>`,
      )
      .join('');
    return `<div class="stack">${segs}</div><ul class="legend">${legend}</ul>`;
  };

  const ranked = (
    items: readonly RankedItem[],
    keyCol: MessageId,
    keyRender: (k: string) => string,
  ) =>
    items.length === 0
      ? `<p class="muted">${t('summary.empty')}</p>`
      : `<div class="table-scroll"><table><thead><tr><th>${t(keyCol)}</th><th class="num">${t('col.occurrences')}</th><th class="num">${t('col.bots')}</th></tr></thead><tbody>${items
          .map(
            (i) =>
              `<tr><td>${keyRender(i.key)}</td><td class="num">${n(i.occurrences)}</td><td class="num">${n(i.bots)}</td></tr>`,
          )
          .join('')}</tbody></table></div>`;

  const opLabel = (op: string) => (op === 'unknown' ? t('op.unknown') : `<code>${esc(op)}</code>`);
  const ruleLabel = (code: string) => {
    const id = code.replace(/^QUAL-/, '').toLowerCase();
    return t(`rule.${id}`);
  };

  const p = result.portfolio;
  const botFiles = new Set(result.bots.map((b) => b.file));
  const unread = result.diagnostics.filter((d) => !d.source || !botFiles.has(d.source.file));
  const notesFor = (file: string) => result.diagnostics.filter((d) => d.source?.file === file);
  const notesTable = (notes: readonly Diagnostic[]) =>
    `<div class="table-scroll"><table><thead><tr><th>${t('col.status')}</th><th>${t('col.detail')}</th><th>${t('col.location')}</th></tr></thead><tbody>${notes
      .map(
        (d) =>
          `<tr><td>${chip(severityStatus[d.severity], t(`severity.${d.severity}`))}</td><td>${t(d.messageId, d.params)}</td><td>${location(d.source, d.nodeId === undefined)}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
  const generated = t('report.generated', {
    date: when(result.generatedAt),
    profile: result.profile.name,
    version: result.profile.version,
  });

  const kpi = (label: string, value: string, note: string) =>
    `<div class="card kpi"><div class="label">${label}</div><div class="value num">${value}</div><div class="note">${note}</div></div>`;

  const maxSizeBots = Math.max(1, ...Object.values(p.effort.bySize).map((s) => s.bots));
  const effortBars = (['S', 'M', 'L', 'XL'] as const)
    .map((s) => {
      const { bots, hours } = p.effort.bySize[s];
      const width = (bots / maxSizeBots) * 100;
      const tip = `${s}: ${translate(catalog, 'summary.effort.bots', { count: bots }, locale)}, ${translate(catalog, 'summary.kpi.effort.unit', { hours })}`;
      return `<div class="bar-row" title="${esc(tip)}"><span class="size">${s}</span><div class="bar-track"><div class="bar" style="width: ${width.toFixed(1)}%"></div></div><span class="num">${t('summary.effort.bots', { count: bots })} · ${t('summary.kpi.effort.unit', { hours: n(hours) })}</span></div>`;
    })
    .join('');

  const botRow = (b: BotAssessment) =>
    `<tr><td><a href="#${anchor('bot', b.id)}">${esc(b.name)}</a></td><td><span class="size-tag">${b.complexity.size}</span></td><td class="num">${n(b.coverage.percent)} %</td><td class="num">${n(b.quality.score)}</td><td class="num">${n(b.quality.findings.length)}</td><td class="num">${n(b.complexity.hours)}</td></tr>`;

  const summary = `
<section class="page" id="summary">
  <div class="section-head"><h1>${t('summary.title')}</h1><p class="muted">${generated}</p></div>
  <div class="grid kpis">
    ${kpi(t('summary.kpi.bots'), n(p.bots), '&nbsp;')}
    ${kpi(t('summary.kpi.statements'), n(p.statements), '&nbsp;')}
    ${kpi(t('summary.kpi.coverage'), `${n(p.coverage.percent)}<small> %</small>`, t('summary.kpi.coverage.note', { covered: p.coverage.mapped + p.coverage.partial, total: p.coverage.total }))}
    ${kpi(t('summary.kpi.quality'), `${n(p.qualityScore)}<small> /100</small>`, t('summary.kpi.quality.note'))}
    ${kpi(t('summary.kpi.effort'), `${n(p.effort.totalHours)}<small> h</small>`, t(p.effort.calibrated ? 'summary.kpi.effort.calibrated' : 'summary.kpi.effort.uncalibrated'))}
  </div>
  <div class="grid two">
    <div class="card"><h3>${t('summary.coverage.title')}</h3><p class="caption muted">${t('summary.coverage.caption')}</p>${coverageBar(p.coverage)}</div>
    <div class="card"><h3>${t('summary.effort.title')}</h3><p class="caption muted">${t('summary.effort.caption')}</p><div class="bars">${effortBars}</div></div>
  </div>
  <div class="grid two">
    <div class="card"><h3>${t('summary.manual.title')}</h3>${ranked(p.topManual, 'col.command', opLabel)}</div>
    <div class="card"><h3>${t('summary.quality.title')}</h3>${ranked(p.topQuality, 'col.issue', ruleLabel)}</div>
  </div>
  <div class="card block"><h3>${t('summary.bots.title')}</h3><div class="table-scroll"><table>
    <thead><tr><th>${t('col.bot')}</th><th>${t('col.size')}</th><th class="num">${t('col.coverage')}</th><th class="num">${t('col.quality')}</th><th class="num">${t('col.findings')}</th><th class="num">${t('col.hours')}</th></tr></thead>
    <tbody>${result.bots.map(botRow).join('')}</tbody></table></div></div>
  <div class="grid two block">
    <div class="card"><h3>${t('summary.packages.title')}</h3><div class="table-scroll"><table>
      <thead><tr><th>${t('col.package')}</th><th>${t('col.version')}</th><th class="num">${t('col.bots')}</th></tr></thead>
      <tbody>${p.packages.map((pk) => `<tr><td>${esc(pk.name)}</td><td class="num">${esc(pk.version)}</td><td class="num">${n(pk.bots)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h3>${chip('info', t('summary.pending.title'))}</h3><p class="caption muted">${t('summary.pending.body', { rules: result.pendingRules.map((r) => translate(catalog, `rule.${r}`)).join(', ') })}</p></div>
  </div>
  ${unread.length ? `<div class="card block"><h3>${t('summary.unread.title')}</h3>${notesTable(unread)}</div>` : ''}
</section>`;

  const finding = (d: Diagnostic) =>
    `<tr><td>${chip(severityStatus[d.severity], t(`severity.${d.severity}`))}</td><td><span class="sub">${ruleLabel(d.code)}</span><br>${t(d.messageId, d.params)}</td><td>${location(d.source, d.nodeId === undefined)}</td></tr>`;

  const botSection = (b: BotAssessment) => {
    const metricRows = (Object.keys(b.metrics) as (keyof typeof b.metrics)[])
      .map((k) => `<tr><td>${t(`metric.${k}`)}</td><td class="num">${n(b.metrics[k])}</td></tr>`)
      .join('');
    const items = b.conversionItems.length
      ? `<div class="table-scroll"><table><thead><tr><th>${t('col.status')}</th><th>${t('col.command')}</th><th>${t('col.detail')}</th><th>${t('col.location')}</th></tr></thead><tbody>${b.conversionItems
          .map(
            (i) =>
              `<tr><td>${chip(bucketStatus[i.bucket], t(`bucket.${i.bucket}`))}</td><td>${opLabel(i.op)}</td><td>${t(`reason.${i.reason}`)}</td><td>${location(i.source, false)}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : `<p>${chip('auto', t('bot.conversion.none'))}</p>`;
    const findings = b.quality.findings.length
      ? `<div class="table-scroll"><table><thead><tr><th>${t('col.status')}</th><th>${t('col.issue')}</th><th>${t('col.location')}</th></tr></thead><tbody>${b.quality.findings.map(finding).join('')}</tbody></table></div>`
      : `<p>${chip('auto', t('bot.quality.none'))}</p>`;
    return `
<section class="page bot" id="${anchor('bot', b.id)}">
  <div class="bot-head">
    <div class="meta"><h2>${esc(b.name)}</h2>${b.description ? `<p>${esc(b.description)}</p>` : ''}<p class="muted">${t('bot.file', { file: b.file })}</p></div>
    <p class="sub">${t('bot.complexity', { score: n(b.complexity.score), size: b.complexity.size, hours: n(b.complexity.hours) })}</p>
  </div>
  <div class="grid metrics">
    ${kpi(t('col.coverage'), `${n(b.coverage.percent)}<small> %</small>`, '&nbsp;')}
    ${kpi(t('col.quality'), `${n(b.quality.score)}<small> /100</small>`, '&nbsp;')}
    ${kpi(t('col.size'), b.complexity.size, t('summary.kpi.effort.unit', { hours: n(b.complexity.hours) }))}
    ${kpi(t('col.findings'), n(b.quality.findings.length), '&nbsp;')}
  </div>
  <div class="grid two block">
    <div class="card"><h3>${t('bot.coverage.title')}</h3>${coverageBar(b.coverage)}</div>
    <div class="card"><h3>${t('bot.metrics.title')}</h3><table><thead><tr><th>${t('col.metric')}</th><th class="num">${t('col.value')}</th></tr></thead><tbody>${metricRows}</tbody></table></div>
  </div>
  <div class="card block"><h3>${t('bot.conversion.title')}</h3>${items}</div>
  <div class="card block"><h3>${t('bot.quality.title')}</h3>${findings}</div>
  ${notesFor(b.file).length ? `<div class="card block"><h3>${t('bot.reading.title')}</h3>${notesTable(notesFor(b.file))}</div>` : ''}
</section>`;
  };

  const banner = result.synthetic
    ? `<div class="banner" role="note"><div class="wrap">${icon('review')}<div><strong>${t('report.synthetic.title')}</strong><p>${t('report.synthetic.body')}</p></div></div></div>`
    : '';

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('report.product')} · ${t('report.title')}</title>
<!-- Fonts: Montserrat and Chakra Petch, SIL Open Font License 1.1, embedded for offline use. -->
<style>
${fontFaceCss()}
${reportCss()}
</style>
</head>
<body>
<header class="masthead"><div class="wrap">
  <div class="logo-space"><img class="logo" src="${logoDataUri('white')}" alt="${t('report.logoAlt')}" width="${LOGO_WIDTH}" height="${logoHeight(LOGO_WIDTH)}"></div>
  <div class="titles"><span class="product">${t('report.product')} · ${t('report.title')}</span><span class="subtitle">${t('report.subtitle')}</span></div>
</div></header>
${banner}
<nav class="toc"><div class="wrap"><a href="#summary">${t('report.nav.summary')}</a>${result.bots.map((b) => `<a href="#${anchor('bot', b.id)}">${esc(b.name)}</a>`).join('')}</div></nav>
<main><div class="wrap">
${summary}
${result.bots.map(botSection).join('\n')}
</div></main>
<footer><div class="wrap">${t('report.product')} · ${generated}</div></footer>
</body>
</html>
`;
}

/** Machine-readable report. */
export function renderJson(result: AssessmentResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
