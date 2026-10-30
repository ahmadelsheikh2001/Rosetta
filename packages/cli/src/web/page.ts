import { readFileSync } from 'node:fs';
import { toCss } from '@rosetta/design-tokens';
import { fontFaceCss, logoDataUri, logoHeight } from '@rosetta/report';

const asset = (name: string): string =>
  readFileSync(new URL(`../../web/${name}`, import.meta.url), 'utf8');

const LOGO_WIDTH = 150;

/** Conversions offered in the UI. Planned ones are listed but cannot be chosen yet. */
const sources = [
  { value: 'a360', label: 'Automation Anywhere A360' },
  { value: 'uipath', label: 'UiPath (planned)', disabled: true },
  { value: 'blueprism', label: 'Blue Prism (planned)', disabled: true },
  { value: 'powerautomate', label: 'Power Automate (planned)', disabled: true },
];
const targets = [{ value: 'ibm-rpa', label: 'IBM RPA (WAL script)' }];

const options = (list: readonly { value: string; label: string; disabled?: boolean }[]) =>
  list
    .map((o) => `<option value="${o.value}"${o.disabled ? ' disabled' : ''}>${o.label}</option>`)
    .join('');

/**
 * The single page of the web UI: fonts, logo, styles and script are all inline, so it
 * works without network access (ADR-015, ADR-021).
 */
export function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RPA Rosetta · Bot migration</title>
<style>
${fontFaceCss()}
${toCss()}
${asset('app.css')}
</style>
</head>
<body>
<header class="top"><div class="wrap">
  <img class="logo" src="${logoDataUri('white')}" alt="Valleysoft" width="${LOGO_WIDTH}" height="${logoHeight(LOGO_WIDTH)}">
  <div class="titles"><span class="product">RPA Rosetta</span><span class="subtitle">Bot migration accelerator</span></div>
  <span class="local"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h12v10H6zM8 11V7a4 4 0 018 0v4"/></svg>Runs on this computer · files never leave it</span>
</div></header>
<main><div class="wrap">
  <section class="intro">
    <h1>Convert your bots</h1>
    <p>Choose the platforms, upload the bot files and get the IBM RPA scripts with notes on everything to check.</p>
  </section>

  <section class="card" aria-labelledby="s1">
    <h2 id="s1"><span class="step">1</span>Choose the conversion</h2>
    <p class="lead">More source platforms will be added; they are listed so you can see what is coming.</p>
    <div class="route">
      <div class="field"><label for="source">From</label><select id="source">${options(sources)}</select></div>
      <div class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg></div>
      <div class="field"><label for="target">To</label><select id="target">${options(targets)}</select></div>
    </div>
  </section>

  <section class="card" aria-labelledby="s2">
    <h2 id="s2"><span class="step">2</span>Upload the bot files</h2>
    <p class="lead">A360 task bot files (.json), one per bot. Upload a parent and its child bots together.</p>
    <label class="drop" id="drop" tabindex="0">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>
      <strong>Drop files here or click to browse</strong>
      <span class="hint">Export from the Control Room: the bot's raw content (.json). Zip exports are not supported yet.</span>
      <input id="file-input" class="sr-only" type="file" accept=".json,application/json" multiple>
    </label>
    <ul class="files" id="file-list" aria-label="Chosen files"></ul>
    <button class="primary" id="convert" type="button" disabled><span class="label">Convert to IBM RPA</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg></button>
    <div id="error" hidden></div>
  </section>

  <section class="card" id="result" hidden aria-live="polite"></section>

  <footer>RPA Rosetta · Valleysoft Center of Excellence. The IBM RPA scripts are drafts until verified in IBM RPA Studio.</footer>
</div></main>
<script>
${asset('app.js')}
</script>
</body>
</html>
`;
}
