import {
  assess,
  syntheticProject,
  syntheticRegistry,
  type AssessmentResult,
} from '@rosetta/assessment';
import { bot, type Project } from '@rosetta/ir';
import { defaultProfile, qualityRuleId } from '@rosetta/standards';
import { describe, expect, it } from 'vitest';
import { en, translate } from './catalog.js';
import { logoDataUri } from './logo.js';
import { renderHtml, renderJson } from './render.js';
import { layoutCss } from './styles.js';

const run = (project: Project, synthetic: boolean): AssessmentResult =>
  assess(project, {
    profile: defaultProfile,
    registry: syntheticRegistry,
    generatedAt: '2026-10-28T09:00:00Z',
    synthetic,
  });

const result = run(syntheticProject(), true);
const html = renderHtml(result);

describe('renderHtml', () => {
  it('shows the synthetic data banner only for synthetic results', () => {
    const banner = `<strong>${en['report.synthetic.title']}</strong>`;
    expect(html).toContain(banner);
    const real = renderHtml(
      run({ bots: [bot('Real', [])], dependencies: [], diagnostics: [] }, false),
    );
    expect(real).not.toContain(banner);
    expect(real).not.toContain('class="banner"');
  });

  it('has a summary and one drill-down section per bot, linked from the nav', () => {
    expect(html).toContain('id="summary"');
    for (const b of result.bots) {
      expect(html).toContain(`>${b.name}</h2>`);
    }
    expect(html.match(/<section class="page bot"/g)).toHaveLength(result.bots.length);
  });

  it('is fully offline: no external scripts, styles, fonts or images', () => {
    expect(html).not.toMatch(/<script|<link|@import|<iframe/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    // images only as embedded data (the logo)
    for (const [, src = ''] of html.matchAll(/<img[^>]*\ssrc="([^"]*)"/gi))
      expect(src.startsWith('data:image/png;base64,')).toBe(true);
    const urls = [...html.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1] ?? '');
    expect(urls.every((u) => u.startsWith('data:font/woff2;base64,'))).toBe(true);
  });

  it('embeds only the brand fonts, in the allowed weights', () => {
    const faces = [
      ...html.matchAll(/font-family: '([^']+)';\s+font-style: normal;\s+font-weight: (\d+)/g),
    ].map((m) => `${m[1]} ${m[2]}`);
    expect(faces).toEqual([
      'Montserrat 300',
      'Montserrat 400',
      'Montserrat 500',
      'Montserrat 600',
      'Montserrat 700',
      'Chakra Petch 300',
      'Chakra Petch 500',
      'Chakra Petch 700',
    ]);
  });

  it('embeds the official white logo on the Oxford Blue masthead (B-04, B-05)', () => {
    const masthead = /<header class="masthead">[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
    expect(masthead).toContain(logoDataUri('white'));
    expect(masthead).toContain('alt="Valleysoft"');
    expect(masthead).not.toContain(logoDataUri('dark'));
  });

  it('never renders a missing string', () => {
    expect(html).not.toContain('⟦');
  });

  it('pairs every status chip with an icon and a text label', () => {
    const chips = [...html.matchAll(/<span class="chip (\w+)">(.*?)<\/span><\/span>/g)];
    expect(chips.length).toBeGreaterThan(10);
    for (const [, , inner] of chips) {
      expect(inner).toMatch(/^<svg class="icon"/);
      expect(inner).toMatch(/<span>[^<]+$/);
    }
  });

  it('escapes data coming from the bots', () => {
    const nasty = renderHtml(
      run(
        { bots: [bot('<script>alert(1)</script>', [])], dependencies: [], diagnostics: [] },
        false,
      ),
    );
    expect(nasty).not.toContain('<script>alert(1)</script>');
    expect(nasty).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the uncalibrated effort caveat while sizing is not calibrated', () => {
    expect(html).toContain(en['summary.kpi.effort.uncalibrated']);
  });

  it('includes a print stylesheet that starts each bot on a new page', () => {
    expect(html).toMatch(/@media print[\s\S]*section\.bot \{ break-before: page; \}/);
  });
});

describe('styles', () => {
  it('add no colour of their own: everything comes from design tokens', () => {
    expect(layoutCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});

describe('catalog', () => {
  it('has a message and a label for every quality rule', () => {
    for (const id of qualityRuleId.options) {
      expect(en).toHaveProperty(`quality.${id}`);
      expect(en).toHaveProperty(`rule.${id}`);
    }
  });

  it('fills placeholders and flags unknown ids', () => {
    expect(translate(en, 'summary.effort.bots', { count: 3 })).toBe('3 bots');
    expect(translate(en, 'summary.effort.bots', { count: 1 })).toBe('1 bot');
    expect(translate(en, 'nope')).toBe('⟦nope⟧');
  });
});

describe('renderJson', () => {
  it('round-trips the assessment result', () => {
    expect(JSON.parse(renderJson(result))).toEqual(JSON.parse(JSON.stringify(result)));
  });
});
