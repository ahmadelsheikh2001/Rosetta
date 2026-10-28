import { describe, expect, it } from 'vitest';
import { isHex, neutral, palette, primary, secondary, tint } from './colors.js';
import { toCss } from './css.js';
import { logoClearSpace, logoFileName, logoVersionFor } from './logo.js';
import { resolveColor, semanticColors, statuses } from './semantic.js';

describe('brand palette', () => {
  it('matches the Valleysoft Brand Guidebook 2025 exactly', () => {
    expect(primary).toEqual({
      blackBlue: '#02021E',
      oxfordBlue: '#001944',
      charcoal: '#2B3E51',
      biceBlue: '#0071B4',
      dodgerBlue: '#0094F7',
      antiFlashWhite: '#EBEFF0',
    });
    expect(secondary).toEqual({
      smokyBlack: '#110C01',
      cafeNoir: '#442B00',
      darkCafe: '#513E2B',
      rust: '#B44300',
      spanishOrange: '#F76300',
      isabelline: '#F0ECEB',
    });
    expect(neutral).toEqual({ white: '#FFFFFF' });
  });

  it('uses valid upper-case HEX values', () => {
    for (const hex of Object.values(palette)) expect(isHex(hex)).toBe(true);
  });
});

describe('tint', () => {
  it('returns the colour itself at 0 and white at 1', () => {
    expect(tint('oxfordBlue', 0)).toBe('#001944');
    expect(tint('oxfordBlue', 1)).toBe('#FFFFFF');
  });

  it('mixes toward white', () => {
    expect(tint('blackBlue', 0.5)).toBe('#81818F');
  });

  it('rejects amounts outside [0, 1]', () => {
    expect(() => tint('rust', 1.5)).toThrow(RangeError);
    expect(() => tint('rust', Number.NaN)).toThrow(RangeError);
  });
});

describe('semantic colours', () => {
  it('only resolve to brand colours or their tints', () => {
    for (const ref of Object.values(semanticColors)) {
      const hex = resolveColor(ref);
      const tintAmount = 'tint' in ref ? ref.tint : 0;
      expect(hex).toBe(tint(ref.color, tintAmount));
    }
  });

  it('uses white for page and cards, Anti-Flash White for sections', () => {
    expect(resolveColor(semanticColors.background)).toBe('#FFFFFF');
    expect(resolveColor(semanticColors.surface)).toBe('#FFFFFF');
    expect(resolveColor(semanticColors.section)).toBe('#EBEFF0');
  });
});

describe('statuses', () => {
  it('maps auto/review/blocked/info to the approved colours', () => {
    const hex = (s: keyof typeof statuses): string =>
      resolveColor(semanticColors[statuses[s].color]);
    expect(hex('auto')).toBe(primary.dodgerBlue);
    expect(hex('review')).toBe(secondary.spanishOrange);
    expect(hex('blocked')).toBe(secondary.rust);
    expect(hex('info')).toBe(primary.biceBlue);
  });

  it('never relies on colour alone: every status has an icon and a label', () => {
    for (const s of Object.values(statuses)) {
      expect(s.icon).not.toBe('');
      expect(s.labelId).toMatch(/^status\./);
    }
  });
});

describe('toCss', () => {
  const css = toCss();

  it('exposes every brand colour as a custom property', () => {
    for (const hex of Object.values(palette)) expect(css).toContain(hex);
  });

  it('applies the headline rules', () => {
    expect(css).toContain('text-transform: uppercase;');
    expect(css).toContain('letter-spacing: 0.1em;');
  });

  it('never references an external resource', () => {
    expect(css).not.toMatch(/https?:|@import|url\(/);
  });
});

describe('logo', () => {
  it('requires clear space of at least one eighth of the width', () => {
    expect(logoClearSpace(160)).toBe(20);
    expect(logoClearSpace(100)).toBe(13);
  });

  it('picks the white logo on dark backgrounds and the dark logo on light ones', () => {
    expect(logoVersionFor('blackBlue')).toBe('white');
    expect(logoVersionFor('oxfordBlue')).toBe('white');
    expect(logoVersionFor('white')).toBe('dark');
    expect(logoVersionFor('antiFlashWhite')).toBe('dark');
    expect(logoVersionFor('biceBlue')).toBe('dark');
  });

  it('refuses backgrounds not approved for the logo', () => {
    expect(logoVersionFor('spanishOrange')).toBeUndefined();
    expect(logoVersionFor('charcoal')).toBeUndefined();
  });

  it('names the official artwork files', () => {
    expect(logoFileName('icon', 'white')).toBe('valleysoft-icon-white.svg');
  });
});
