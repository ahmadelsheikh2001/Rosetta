import {
  action,
  bot,
  comment,
  ifThen,
  lit,
  loopTimes,
  tryCatch,
  type Project,
  type Statement,
} from '@rosetta/ir';
import type { MappingEntry } from '@rosetta/mappings';
import { defaultProfile, resolveProfile } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { assess } from './assess.js';
import { complexity, measure } from './complexity.js';
import { classify, fromCounts, summarize } from './coverage.js';
import { qualityScore, weightedScore } from './quality-score.js';

const entry = (id: string, status: MappingEntry['status']): MappingEntry => ({
  id,
  source: { platform: 'a360', package: 'Synthetic', command: id },
  status,
  ...(status === 'mapped' || status === 'partial' ? { irOp: 'synthetic.op' } : {}),
  evidence: [],
});

const registry = [
  entry('syn.mapped', 'mapped'),
  entry('syn.partial', 'partial'),
  entry('syn.planned', 'planned'),
  entry('syn.unsupported', 'unsupported'),
];
const index = new Map(registry.map((e) => [e.id, e]));

const mapped = (): Statement => action('file.copy', { mappingId: 'syn.mapped' });
const partial = (): Statement => action('file.move', { mappingId: 'syn.partial' });
const unmapped = (): Statement => action('vendor:a360/Synthetic/thing');
const unknown: Statement = { id: 'u1', kind: 'unknown', raw: {}, reason: 'test' };

describe('classify', () => {
  it('buckets actions by registry status', () => {
    const bucket = (s: Statement) => classify(s, index)?.bucket;
    expect(bucket(mapped())).toBe('mapped');
    expect(bucket(partial())).toBe('partial');
    expect(bucket(action('x.y', { mappingId: 'syn.planned' }))).toBe('manual');
    expect(bucket(action('x.y', { mappingId: 'syn.unsupported' }))).toBe('manual');
  });

  it('treats unregistered actions and unknown nodes as manual', () => {
    expect(classify(unmapped(), index)).toMatchObject({
      bucket: 'manual',
      reason: 'not-in-registry',
    });
    expect(classify(action('x.y', { mappingId: 'gone' }), index)?.reason).toBe('not-in-registry');
    expect(classify(unknown, index)).toMatchObject({ bucket: 'manual', reason: 'unknown-node' });
  });

  it('does not count control flow', () => {
    expect(classify(ifThen(lit(true), []), index)).toBeUndefined();
    expect(classify(comment('x'), index)).toBeUndefined();
  });
});

describe('coverage summary', () => {
  it('counts mapped + partial as covered', () => {
    expect(
      summarize([
        { bucket: 'mapped' },
        { bucket: 'partial' },
        { bucket: 'manual' },
        { bucket: 'manual' },
      ]),
    ).toEqual({
      mapped: 1,
      partial: 1,
      manual: 2,
      total: 4,
      percent: 50,
    });
  });

  it('is 100 % when there is nothing to convert', () => {
    expect(fromCounts(0, 0, 0).percent).toBe(100);
  });
});

describe('complexity', () => {
  const sample = bot(
    'b',
    [
      comment('doc'),
      loopTimes(2, [ifThen(lit(true), [tryCatch([mapped()], [{ body: [] }])])]),
      action('ui.click', { target: { technology: 'web', strategies: [], raw: {} } }),
      { id: 'c', kind: 'callBot', target: { path: 'child' }, inputs: {}, outputs: {} },
    ],
    {
      packages: [
        { name: 'P1', version: '1' },
        { name: 'P2', version: '2' },
      ],
    },
  );

  it('measures the bot', () => {
    expect(measure(sample, 3)).toEqual({
      nodes: 6,
      maxDepth: 3,
      packages: 2,
      uiActions: 1,
      subBotCalls: 1,
      unmapped: 3,
      errorHandlers: 1,
    });
  });

  it('computes the weighted score and size from the profile', () => {
    // defaults: nodes 1, maxDepth 5, packages 3, uiActions 2, subBotCalls 3, unmapped 8, errorHandlers 1
    const result = complexity(measure(sample, 3), defaultProfile);
    // 57 is above the S threshold (50) and within M (150)
    expect(result).toEqual({ score: 6 + 15 + 6 + 2 + 3 + 24 + 1, size: 'M', hours: 12 });
  });

  it('moves across size boundaries and follows overridden hours', () => {
    const { profile } = resolveProfile([
      {
        name: 'company',
        source: 'c',
        data: { sizing: { thresholds: { S: 10, M: 20, L: 30 }, hoursPerSize: { XL: 100 } } },
      },
    ]);
    const m = measure(sample, 3);
    expect(complexity(m, profile)).toMatchObject({ size: 'XL', hours: 100 });
    // 6 nodes + 2 ui + 3 sub-bot + 1 handler = 12, within M (11–20)
    expect(complexity({ ...m, unmapped: 0, packages: 0, maxDepth: 0 }, profile).size).toBe('M');
  });
});

describe('quality score', () => {
  const d = (severity: 'error' | 'warning' | 'info') =>
    ({ code: 'X', severity, category: 'quality', messageId: 'x', params: {} }) as const;

  it('subtracts the profile penalty per finding and floors at 0', () => {
    expect(qualityScore([], defaultProfile)).toBe(100);
    expect(qualityScore([d('error'), d('warning'), d('info')], defaultProfile)).toBe(85);
    expect(
      qualityScore(
        Array.from({ length: 20 }, () => d('error')),
        defaultProfile,
      ),
    ).toBe(0);
  });

  it('weights the portfolio score by bot size', () => {
    expect(
      weightedScore([
        { score: 100, nodes: 90 },
        { score: 0, nodes: 10 },
      ]),
    ).toBe(90);
    expect(weightedScore([])).toBe(100);
  });
});

describe('assess', () => {
  const project: Project = {
    bots: [
      bot(
        'Clean',
        [
          tryCatch(
            [mapped(), mapped()],
            [{ body: [action('log.write', { mappingId: 'syn.mapped' })] }],
          ),
        ],
        {
          packages: [{ name: 'P1', version: '1.0' }],
        },
      ),
      bot('Messy', [unmapped(), unmapped(), partial(), unknown], {
        packages: [
          { name: 'P1', version: '1.0' },
          { name: 'P2', version: '3.1' },
        ],
      }),
    ],
    dependencies: [],
    diagnostics: [],
  };
  const result = assess(project, {
    profile: defaultProfile,
    registry,
    generatedAt: '2026-10-28T00:00:00Z',
    synthetic: true,
  });

  it('assesses every bot', () => {
    expect(result.bots.map((b) => [b.name, b.coverage.percent, b.quality.score])).toEqual([
      ['Clean', 100, 100],
      ['Messy', 25, 96],
    ]);
  });

  it('lists only items needing attention per bot', () => {
    expect(result.bots[1]?.conversionItems.map((i) => i.reason)).toEqual([
      'not-in-registry',
      'not-in-registry',
      'partial',
      'unknown-node',
    ]);
  });

  it('aggregates the portfolio', () => {
    const p = result.portfolio;
    expect(p.bots).toBe(2);
    expect(p.coverage).toEqual({ mapped: 3, partial: 1, manual: 3, total: 7, percent: 57.1 });
    expect(p.topManual[0]).toEqual({ key: 'vendor:a360/Synthetic/thing', occurrences: 2, bots: 1 });
    expect(p.topQuality.map((q) => q.key)).toContain('QUAL-MISSING-ERROR-HANDLING');
    expect(p.effort.totalHours).toBe(
      p.effort.bySize.S.hours +
        p.effort.bySize.M.hours +
        p.effort.bySize.L.hours +
        p.effort.bySize.XL.hours,
    );
    expect(p.effort.calibrated).toBe(false);
    expect(p.packages).toEqual([
      { name: 'P1', version: '1.0', bots: 2 },
      { name: 'P2', version: '3.1', bots: 1 },
    ]);
  });

  it('carries provenance flags for the report', () => {
    expect(result.synthetic).toBe(true);
    expect(result.pendingRules).toContain('hardcoded-credential');
    expect(result.profile.name).toBe('rosetta-defaults');
  });
});
