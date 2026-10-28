import type { IRTypeKind } from '@rosetta/ir';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { defaultProfile } from './defaults.js';
import { standardsProfile, type irTypeKinds } from './profile.js';

describe('standardsProfile schema', () => {
  it('accepts the built-in defaults', () => {
    expect(standardsProfile.safeParse(defaultProfile).success).toBe(true);
  });

  it('keeps behavioral transforms off by default', () => {
    expect(Object.values(defaultProfile.behavioral)).toEqual([false, false]);
  });

  it('treats exceptions as system by default', () => {
    expect(defaultProfile.errors.defaultCategory).toBe('system');
  });

  it('rejects unknown keys so typos in profiles surface', () => {
    const result = standardsProfile.safeParse({ ...defaultProfile, logginng: {} });
    expect(result.success).toBe(false);
  });

  it('rejects non-increasing sizing thresholds', () => {
    const bad = {
      ...defaultProfile,
      sizing: { ...defaultProfile.sizing, thresholds: { S: 100, M: 50, L: 400 } },
    };
    expect(standardsProfile.safeParse(bad).success).toBe(false);
  });

  it('lists exactly the IR type kinds', () => {
    expectTypeOf<z.infer<typeof irTypeKinds>>().toEqualTypeOf<IRTypeKind>();
  });
});
