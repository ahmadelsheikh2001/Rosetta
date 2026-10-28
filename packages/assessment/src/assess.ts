import { walk, type Diagnostic, type PackageVersion, type Project } from '@rosetta/ir';
import type { MappingEntry } from '@rosetta/mappings';
import {
  checkBot,
  pendingRules,
  type QualityRuleId,
  type Size,
  type StandardsProfile,
} from '@rosetta/standards';
import { complexity, measure, type BotMetrics, type Complexity } from './complexity.js';
import { classify, fromCounts, summarize, type Coverage, type CoverageItem } from './coverage.js';
import { qualityScore, weightedScore } from './quality-score.js';

export interface BotAssessment {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly file: string;
  readonly metrics: BotMetrics;
  readonly complexity: Complexity;
  readonly coverage: Coverage;
  /** Items that are not fully automatic (partial or manual), in source order. */
  readonly conversionItems: readonly CoverageItem[];
  readonly quality: { readonly score: number; readonly findings: readonly Diagnostic[] };
  readonly packages: readonly PackageVersion[];
}

export interface RankedItem {
  readonly key: string;
  readonly occurrences: number;
  readonly bots: number;
}

export interface PortfolioSummary {
  readonly bots: number;
  readonly statements: number;
  readonly coverage: Coverage;
  readonly qualityScore: number;
  readonly effort: {
    readonly bySize: Readonly<Record<Size, { readonly bots: number; readonly hours: number }>>;
    readonly totalHours: number;
    readonly calibrated: boolean;
  };
  /** Ops needing manual conversion, most frequent first. */
  readonly topManual: readonly RankedItem[];
  /** Quality rule codes, most frequent first. */
  readonly topQuality: readonly RankedItem[];
  readonly packages: readonly (PackageVersion & { readonly bots: number })[];
}

export interface AssessmentResult {
  /** ISO timestamp; passed in so results are reproducible. */
  readonly generatedAt: string;
  /** True when built from hand-made data; the report shows a banner. */
  readonly synthetic: boolean;
  readonly profile: { readonly name: string; readonly version: number };
  readonly pendingRules: readonly QualityRuleId[];
  readonly portfolio: PortfolioSummary;
  readonly bots: readonly BotAssessment[];
  /** Project-level diagnostics (e.g. parse problems). */
  readonly diagnostics: readonly Diagnostic[];
}

export interface AssessOptions {
  readonly profile: StandardsProfile;
  readonly registry: readonly MappingEntry[];
  readonly generatedAt: string;
  readonly synthetic?: boolean;
  /** How many entries the top lists keep. */
  readonly topN?: number;
}

function rank(keysPerBot: readonly (readonly string[])[], topN: number): RankedItem[] {
  const occurrences = new Map<string, number>();
  const bots = new Map<string, number>();
  for (const keys of keysPerBot) {
    for (const k of keys) occurrences.set(k, (occurrences.get(k) ?? 0) + 1);
    for (const k of new Set(keys)) bots.set(k, (bots.get(k) ?? 0) + 1);
  }
  return [...occurrences]
    .map(([key, n]) => ({ key, occurrences: n, bots: bots.get(key) ?? 0 }))
    .sort((a, b) => b.occurrences - a.occurrences || a.key.localeCompare(b.key))
    .slice(0, topN);
}

/** Assesses every bot of a project: coverage, complexity, sizing and source quality. */
export function assess(project: Project, options: AssessOptions): AssessmentResult {
  const { profile, generatedAt, synthetic = false, topN = 10 } = options;
  const registry = new Map(options.registry.map((e) => [e.id, e]));

  const bots: BotAssessment[] = project.bots.map((bot) => {
    const items: CoverageItem[] = [];
    walk(bot.body, (stmt) => {
      const item = classify(stmt, registry);
      if (item) items.push(item);
    });
    const coverage = summarize(items);
    const metrics = measure(bot, coverage.manual);
    const findings = checkBot(bot, profile, 'source');
    return {
      id: bot.id,
      name: bot.name,
      ...(bot.description === undefined ? {} : { description: bot.description }),
      file: bot.source.file,
      metrics,
      complexity: complexity(metrics, profile),
      coverage,
      conversionItems: items.filter((i) => i.bucket !== 'mapped'),
      quality: { score: qualityScore(findings, profile), findings },
      packages: bot.packages,
    };
  });

  const sizes: Size[] = ['S', 'M', 'L', 'XL'];
  const bySize = Object.fromEntries(
    sizes.map((s) => {
      const inSize = bots.filter((b) => b.complexity.size === s);
      return [
        s,
        { bots: inSize.length, hours: inSize.reduce((h, b) => h + b.complexity.hours, 0) },
      ];
    }),
  ) as Record<Size, { bots: number; hours: number }>;

  const packages = rank(
    bots.map((b) => b.packages.map((p) => `${p.name}\u0000${p.version}`)),
    Number.MAX_SAFE_INTEGER,
  ).map((r) => {
    const [name = '', version = ''] = r.key.split('\u0000');
    return { name, version, bots: r.bots };
  });

  return {
    generatedAt,
    synthetic,
    profile: { name: profile.profile, version: profile.version },
    pendingRules: pendingRules(),
    portfolio: {
      bots: bots.length,
      statements: bots.reduce((n, b) => n + b.metrics.nodes, 0),
      coverage: fromCounts(
        bots.reduce((n, b) => n + b.coverage.mapped, 0),
        bots.reduce((n, b) => n + b.coverage.partial, 0),
        bots.reduce((n, b) => n + b.coverage.manual, 0),
      ),
      qualityScore: weightedScore(
        bots.map((b) => ({ score: b.quality.score, nodes: b.metrics.nodes })),
      ),
      effort: {
        bySize,
        totalHours: bots.reduce((h, b) => h + b.complexity.hours, 0),
        calibrated: profile.sizing.calibrated,
      },
      topManual: rank(
        bots.map((b) => b.conversionItems.filter((i) => i.bucket === 'manual').map((i) => i.op)),
        topN,
      ),
      topQuality: rank(
        bots.map((b) => b.quality.findings.map((f) => f.code)),
        topN,
      ),
      packages,
    },
    bots,
    diagnostics: project.diagnostics,
  };
}
