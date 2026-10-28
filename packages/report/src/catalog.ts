/**
 * Report string catalog (ADR-010). Every user-visible string lives here so a
 * second language is a new catalog, not a code change. `{name}` placeholders
 * are filled from params.
 */
export const en = {
  'report.title': 'Migration assessment',
  'report.product': 'RPA Rosetta',
  'report.subtitle': 'Automation Anywhere A360 → IBM RPA',
  'report.generated': 'Generated {date} · profile {profile} v{version}',
  'report.logoPlaceholder': 'Valleysoft logo',
  'report.synthetic.title': 'Synthetic data',
  'report.synthetic.body':
    'This report was rendered from hand-built sample data to review the design. None of the bots, numbers or findings are real.',
  'report.nav.summary': 'Summary',
  'report.nav.bots': 'Bots',

  'summary.title': 'Management summary',
  'summary.kpi.bots': 'Bots assessed',
  'summary.kpi.statements': 'Statements',
  'summary.kpi.coverage': 'Conversion coverage',
  'summary.kpi.coverage.note': '{covered} of {total} actions have a known mapping',
  'summary.kpi.quality': 'Source quality score',
  'summary.kpi.quality.note': 'Out of 100, weighted by bot size',
  'summary.kpi.effort': 'Estimated effort',
  'summary.kpi.effort.unit': '{hours} h',
  'summary.kpi.effort.uncalibrated': 'Not yet calibrated on a pilot; relative sizing only',
  'summary.kpi.effort.calibrated': 'Calibrated estimate',
  'summary.coverage.title': 'Conversion coverage',
  'summary.coverage.caption':
    'All actions across the portfolio, by how they are expected to convert.',
  'summary.effort.title': 'Effort by size',
  'summary.effort.caption': 'Bots per complexity size, with the estimated hours for each size.',
  'summary.effort.bots.one': '{count} bot',
  'summary.effort.bots.other': '{count} bots',
  'summary.manual.title': 'Top commands needing manual work',
  'summary.quality.title': 'Top quality issues in the source bots',
  'summary.bots.title': 'Bots',
  'summary.packages.title': 'Packages in use',
  'summary.pending.title': 'Not yet checked',
  'summary.pending.body':
    'These checks need verified A360 samples and are not part of this score yet: {rules}.',
  'summary.empty': 'Nothing to show.',

  'col.command': 'Command',
  'col.occurrences': 'Occurrences',
  'col.bots': 'Bots',
  'col.issue': 'Issue',
  'col.bot': 'Bot',
  'col.size': 'Size',
  'col.coverage': 'Coverage',
  'col.quality': 'Quality',
  'col.findings': 'Findings',
  'col.hours': 'Hours',
  'col.package': 'Package',
  'col.version': 'Version',
  'col.status': 'Status',
  'col.detail': 'Detail',
  'col.location': 'Location',
  'col.metric': 'Metric',
  'col.value': 'Value',

  'bot.file': 'Source: {file}',
  'bot.complexity': 'Complexity {score} · size {size} · {hours} h',
  'bot.coverage.title': 'Conversion coverage',
  'bot.metrics.title': 'Complexity inputs',
  'bot.conversion.title': 'Conversion items needing attention',
  'bot.conversion.none': 'Every action in this bot has a full mapping.',
  'bot.quality.title': 'Source quality findings',
  'bot.quality.none': 'No quality findings.',
  'bot.quality.score': 'Quality score {score}/100',

  'metric.nodes': 'Statements',
  'metric.maxDepth': 'Deepest nesting',
  'metric.packages': 'Packages',
  'metric.uiActions': 'UI actions',
  'metric.subBotCalls': 'Sub-bot calls',
  'metric.unmapped': 'Manual items',
  'metric.errorHandlers': 'Try blocks',

  'bucket.mapped': 'Automatic',
  'bucket.partial': 'Needs review',
  'bucket.manual': 'Manual',

  'reason.mapped': 'Full mapping',
  'reason.partial': 'Converts, but needs review',
  'reason.planned': 'Known command, no conversion yet',
  'reason.unsupported': 'Not converted by design',
  'reason.not-in-registry': 'Command not in the mapping registry',
  'reason.unknown-node': 'Could not be read from the export',

  'status.auto': 'OK',
  'status.review': 'Review',
  'status.blocked': 'Blocked',
  'status.info': 'Info',

  'severity.error': 'Error',
  'severity.warning': 'Warning',
  'severity.info': 'Info',

  'location.node': 'node {path}',
  'location.bot': 'whole bot',

  'quality.missing-error-handling':
    '{actions} actions run without any Try block; a failure stops the bot with no handling.',
  'quality.empty-catch': 'Catch {catch} swallows the error without handling or logging it.',
  'quality.deep-nesting': 'Nesting reaches level {level}; the standard allows {max}.',
  'quality.disabled-code': 'Disabled {kind}: not carried over; confirm it can be removed.',
  'quality.unused-variable': 'Variable "{variable}" is declared but never used.',
  'quality.missing-comments':
    '{statements} statements with no comment or Step; the standard asks for one above {threshold}.',
  'quality.hardcoded-credential': 'Hardcoded credential.',
  'quality.fixed-delay': 'Fixed delay instead of an explicit wait.',
  'quality.hardcoded-url': 'Hardcoded URL; should come from configuration.',
  'quality.hardcoded-path': 'Hardcoded path; should come from configuration.',
  'quality.hardcoded-email': 'Hardcoded email address; should come from configuration.',

  'rule.missing-error-handling': 'No error handling',
  'rule.empty-catch': 'Empty catch',
  'rule.deep-nesting': 'Deep nesting',
  'rule.disabled-code': 'Disabled code',
  'rule.unused-variable': 'Unused variable',
  'rule.missing-comments': 'No comments or Steps',
  'rule.hardcoded-credential': 'Hardcoded credentials',
  'rule.fixed-delay': 'Fixed delays',
  'rule.hardcoded-url': 'Hardcoded URLs',
  'rule.hardcoded-path': 'Hardcoded paths',
  'rule.hardcoded-email': 'Hardcoded emails',

  'op.unknown': 'Unreadable node',
} as const;

export type MessageId = keyof typeof en;
export type Catalog = Readonly<Record<MessageId, string>>;

/**
 * Resolves a message and fills `{placeholders}`. When `params.count` is a number,
 * plural forms `<id>.one` / `<id>.other` (CLDR categories for `locale`) are used.
 * Unknown ids render as `⟦id⟧` so a missing string is visible instead of silently empty.
 */
export function translate(
  catalog: Catalog,
  id: string,
  params: Readonly<Record<string, string | number>> = {},
  locale = 'en',
): string {
  const messages = catalog as Readonly<Record<string, string>>;
  const count = params.count;
  const plural =
    typeof count === 'number'
      ? (messages[`${id}.${new Intl.PluralRules(locale).select(count)}`] ?? messages[`${id}.other`])
      : undefined;
  const template = messages[id] ?? plural;
  if (template === undefined) return `⟦${id}⟧`;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
