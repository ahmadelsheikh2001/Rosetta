import { defaultProfile } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { assess } from './assess.js';
import { syntheticProject, syntheticRegistry } from './synthetic.js';

describe('synthetic portfolio', () => {
  const result = assess(syntheticProject(), {
    profile: defaultProfile,
    registry: syntheticRegistry,
    generatedAt: '2026-10-28T00:00:00Z',
    synthetic: true,
  });

  it('spans every size so the report preview shows all states', () => {
    expect(new Set(result.bots.map((b) => b.complexity.size))).toEqual(
      new Set(['S', 'M', 'L', 'XL']),
    );
  });

  it('contains clean and messy bots', () => {
    const findings = result.bots.map((b) => b.quality.findings.length);
    expect(Math.min(...findings)).toBe(0);
    expect(Math.max(...findings)).toBeGreaterThan(3);
  });

  it('uses only invented package names', () => {
    for (const b of result.bots) {
      for (const p of b.packages) expect(p.name).toMatch(/^Synthetic/);
    }
    for (const e of syntheticRegistry) expect(e.id).toMatch(/^synthetic\./);
  });

  it('is deterministic', () => {
    const again = assess(syntheticProject(), {
      profile: defaultProfile,
      registry: syntheticRegistry,
      generatedAt: '2026-10-28T00:00:00Z',
      synthetic: true,
    });
    expect(again).toEqual(result);
  });
});
