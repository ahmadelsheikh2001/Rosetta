import { readFileSync } from 'node:fs';
import { toCss } from '@rosetta/design-tokens';
import { fontFaceCss, logoDataUri, logoHeight } from '@rosetta/report';

const asset = (name: string): string =>
  readFileSync(new URL(`../../web/${name}`, import.meta.url), 'utf8');

const LOGO_WIDTH = 150;

/** Conversions offered in the UI. Planned ones are listed but cannot be chosen yet. */
const sources = [
  { value: 'a360', label: 'Automation Anywhere A360' },
  { value: 'ibm-rpa', label: 'IBM RPA (WAL script)' },
  { value: 'uipath', label: 'UiPath (planned)', disabled: true },
  { value: 'blueprism', label: 'Blue Prism (planned)', disabled: true },
  { value: 'powerautomate', label: 'Power Automate (planned)', disabled: true },
];
/** The target follows the source (app.js); both directions exist (ADR-022). */
const targets = [
  { value: 'ibm-rpa', label: 'IBM RPA (WAL script)' },
  { value: 'a360', label: 'Automation Anywhere A360 (task bot)' },
];

/** Inline line icon (currentColor), as in app.js. */
const icon = (path: string, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${String(size)}" height="${String(size)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

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
<nav class="mainnav" aria-label="Sections"><div class="wrap" role="tablist">
  <button class="navtab" type="button" role="tab" id="tab-convert" aria-controls="view-convert" aria-selected="true">${icon('M4 12h16M14 6l6 6-6 6')}Convert</button>
  <button class="navtab" type="button" role="tab" id="tab-results" aria-controls="view-results" aria-selected="false" disabled>${icon('M4 5h16M4 12h16M4 19h10')}Results<span class="count" id="results-count"></span></button>
  <button class="navtab" type="button" role="tab" id="tab-report" aria-controls="view-report" aria-selected="false" disabled>${icon('M6 3h9l5 5v13H6zM14 3v6h6M9 13h8M9 17h8')}Assessment report</button>
</div></nav>
<main><div class="wrap">
  <section id="view-convert" role="tabpanel" aria-labelledby="tab-convert" class="view">
  <div class="intro">
    <h1>Convert your bots</h1>
    <p>Choose the direction, add the bot files and get the converted bots with notes on everything to check.</p>
  </div>

  <div class="convert-grid">
  <section class="card" aria-labelledby="s1">
    <h2 id="s1"><span class="step">1</span>Direction</h2>
    <p class="lead">More source platforms are listed so you can see what is coming.</p>
    <div class="route">
      <div class="field"><label for="source">From</label><select id="source">${options(sources)}</select></div>
      <div class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg></div>
      <div class="field"><label for="target">To</label><select id="target">${options(targets)}</select></div>
    </div>
    <div class="target-options" id="a360-options" hidden>
      <div class="field"><label for="vault-locker">Credential Vault locker <span class="optional">(optional)</span></label><input id="vault-locker" type="text" maxlength="200" autocomplete="off" spellcheck="false" placeholder="e.g. Finance"></div>
      <div class="field"><label for="bot-folder">Folder of the bots it runs <span class="optional">(optional)</span></label><input id="bot-folder" type="text" maxlength="200" autocomplete="off" spellcheck="false" placeholder="e.g. Bots/Finance"></div>
      <div class="field"><label for="log-file">Log file for logMessage <span class="optional">(optional)</span></label><input id="log-file" type="text" maxlength="260" autocomplete="off" spellcheck="false" placeholder="e.g. C:\\Logs\\MyBot.log"></div>
      <p class="hint">WAL scripts do not name the A360 locker of their vault items or the folder of the bots they start. Without these, the notes say what to set in the A360 editor. Only names are used; no credential value is ever read or written.</p>
    </div>
  </section>

  <section class="card" aria-labelledby="s2">
    <h2 id="s2"><span class="step">2</span>Bot files</h2>
    <p class="lead" id="upload-lead">A360 task bot files (.json) or Control Room export zips. Upload a parent and its child bots together.</p>
    <label class="drop" id="drop" tabindex="0">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>
      <strong>Drop files here or click to browse</strong>
      <span class="hint" id="upload-hint">An export zip is opened here in the browser: only its task bots are read, packages and other files are skipped.</span>
      <input id="file-input" class="sr-only" type="file" accept=".json,.zip,application/json,application/zip" multiple>
    </label>
    <ul class="files" id="file-list" aria-label="Chosen files"></ul>
  </section>
  </div>

  <div class="actionbar">
    <p class="actionhint" id="action-hint">Add at least one file to convert.</p>
    <button class="primary" id="convert" type="button" disabled><span class="label">Convert to IBM RPA</span>${icon('M4 12h16M14 6l6 6-6 6', 20)}</button>
  </div>
  <div id="progress" class="progress" hidden aria-live="polite"></div>
  <div id="error" hidden></div>
  </section>

  <section id="view-results" role="tabpanel" aria-labelledby="tab-results" class="view" hidden aria-live="polite"></section>
  <section id="view-report" role="tabpanel" aria-labelledby="tab-report" class="view" hidden></section>

  <footer>RPA Rosetta · Valleysoft Center of Excellence. Converted bots are drafts until run on the target platform.</footer>
</div></main>
<script>
${asset('app.js')}
</script>
</body>
</html>
`;
}
