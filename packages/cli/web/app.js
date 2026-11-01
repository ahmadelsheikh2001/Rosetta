// RPA Rosetta web UI. Talks only to this server (127.0.0.1); nothing leaves the computer.
'use strict';

const $ = (id) => document.getElementById(id);
const chosen = new Map(); // file name → File
let last = null; // last conversion response
let lastRoute = null; // the direction it was made for

/** The two directions (ADR-022). Texts follow the source platform chosen in step 1. */
const routes = {
  a360: {
    target: 'ibm-rpa',
    accept: '.json,.zip,application/json,application/zip',
    lead: 'A360 task bot files (.json) or Control Room export zips. Upload a parent and its child bots together.',
    hint: 'An export zip is opened here in the browser: only its task bots are read, packages and other files are skipped.',
    button: 'Convert to IBM RPA',
    output: 'IBM RPA scripts',
    code: 'IBM RPA script',
    check: 'Static check',
    sourceLabel: 'A360: ',
    mime: 'text/plain',
    zip: 'rosetta-ibm-rpa.zip',
    closing:
      'The IBM RPA scripts are a draft: open each one in IBM RPA Studio, run it and compare the result with the A360 bot.',
  },
  'ibm-rpa': {
    target: 'a360',
    accept: '.wal',
    lead: 'IBM RPA scripts (.wal), one per bot. Each script becomes one A360 task bot.',
    hint: 'Save the script from IBM RPA Studio as a .wal file. Studio packages are not supported yet.',
    button: 'Convert to A360',
    output: 'A360 task bots',
    code: 'A360 task bot',
    check: 'A360 check',
    sourceLabel: 'IBM RPA: ',
    mime: 'application/json',
    zip: 'rosetta-a360.zip',
    closing:
      'The A360 bots are a draft: create an empty task bot in the Control Room, write this file as its content, then open it in the editor, run it and compare the result with the IBM RPA script.',
  },
};
const route = () => routes[$('source').value] || routes.a360;

// ---- Step 1: the direction ----

function applyRoute() {
  const r = route();
  const target = $('target');
  for (const o of target.options) o.disabled = o.value !== r.target;
  target.value = r.target;
  $('a360-options').hidden = r.target !== 'a360';
  $('upload-lead').textContent = r.lead;
  $('upload-hint').textContent = r.hint;
  $('file-input').setAttribute('accept', r.accept);
  $('convert').querySelector('.label').textContent = r.button;
}

$('source').addEventListener('change', () => {
  // files of the other platform would not convert; start over
  chosen.clear();
  resetResults();
  $('error').hidden = true;
  applyRoute();
  renderFiles();
});

// ---- Main tabs: Convert, Results, Assessment report ----

const views = ['convert', 'results', 'report'];

function showView(name) {
  for (const v of views) {
    $('tab-' + v).setAttribute('aria-selected', String(v === name));
    $('view-' + v).hidden = v !== name;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
for (const v of views) $('tab-' + v).addEventListener('click', () => showView(v));

function resetResults() {
  last = null;
  $('tab-results').disabled = true;
  $('tab-report').disabled = true;
  $('results-count').textContent = '';
  $('view-results').replaceChildren();
  $('view-report').replaceChildren();
  showView('convert');
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Inline icons (currentColor), so status is never shown by colour alone. */
function icon(name, size) {
  const paths = {
    check: 'M5 12l5 5L20 7',
    warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
    stop: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 8l8 8M16 8l-8 8',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 7.5v.5',
    close: 'M6 6l12 12M18 6L6 18',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    back: 'M20 12H4M10 6l-6 6 6 6',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size || 16));
  svg.setAttribute('height', String(size || 16));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name]);
  svg.append(p);
  return svg;
}

const chip = (kind, iconName, label) =>
  el('span', { class: 'chip ' + kind }, icon(iconName, 14), label);
const kb = (n) =>
  n < 1024
    ? n + ' B'
    : n < 1048576
      ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
      : (n / 1048576).toFixed(1) + ' MB';

// ---- Step 2: choosing files ----

function addFiles(list) {
  for (const f of list) chosen.set(f.name, f);
  renderFiles();
}

function renderFiles() {
  const ul = $('file-list');
  ul.replaceChildren(
    ...[...chosen.values()].map((f) =>
      el(
        'li',
        {},
        f.name,
        el('span', { class: 'size' }, kb(f.size)),
        el(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Remove ' + f.name,
            onclick: () => {
              chosen.delete(f.name);
              renderFiles();
            },
          },
          icon('close', 14),
        ),
      ),
    ),
  );
  $('convert').disabled = chosen.size === 0;
  const total = [...chosen.values()].reduce((n, f) => n + f.size, 0);
  $('action-hint').textContent = chosen.size
    ? chosen.size + (chosen.size === 1 ? ' file' : ' files') + ' ready · ' + kb(total)
    : 'Add at least one file to convert.';
}

const drop = $('drop');
$('file-input').addEventListener('change', (e) => {
  addFiles(e.target.files);
  e.target.value = '';
});
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('file-input').click();
  }
});
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, () => drop.classList.remove('over'));
}
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});

// ---- Converting ----

function showError(text) {
  const box = $('error');
  box.replaceChildren(
    el('div', { class: 'alert', role: 'alert' }, icon('stop', 18), el('div', {}, text)),
  );
  box.hidden = false;
}

$('convert').addEventListener('click', async () => {
  const button = $('convert');
  $('error').hidden = true;
  button.disabled = true;
  const label = button.querySelector('.label');
  const before = label.textContent;
  label.textContent = 'Converting…';
  const spin = el('span', { class: 'spinner', 'aria-hidden': 'true' });
  button.prepend(spin);
  try {
    const notes = [];
    const files = (
      await Promise.all(
        [...chosen.values()].map(async (f) => {
          if (NOT_BOTS.test(f.name)) {
            notes.push({ file: f.name, severity: 'warning', text: 'not a bot file, skipped' });
            return [];
          }
          if (/\.wal$/i.test(f.name)) return [{ name: f.name, text: await walText(f) }];
          if (!/\.zip$/i.test(f.name)) return [{ name: f.name, text: await f.text() }];
          const zip = await botsFromZip(f);
          notes.push(...zip.problems.map((p) => ({ file: f.name, severity: 'warning', text: p })));
          return zip.files;
        }),
      )
    ).flat();
    if (files.length === 0) throw new Error(notes.map((n) => n.file + ': ' + n.text).join(' · '));
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: $('source').value,
        target: $('target').value,
        files,
        options: {
          vaultLocker: $('vault-locker').value.trim(),
          botFolder: $('bot-folder').value.trim(),
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'The conversion failed.');
    body.messages = [...notes, ...body.messages];
    last = body;
    lastRoute = route();
    renderResult(body);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    spin.remove();
    label.textContent = before;
    button.disabled = chosen.size === 0;
  }
});

// ---- Step 3: result ----

function counts(bot) {
  const by = (k) => bot.notes.filter((n) => n.kind === k).length;
  return {
    errors: bot.problems.filter((p) => p.severity === 'error').length,
    manual: by('manual'),
    semantic: by('semantic'),
    verify: by('verify'),
  };
}

function renderResult(r) {
  const section = $('view-results');
  const total = r.bots.map(counts).reduce(
    (a, c) => ({
      errors: a.errors + c.errors,
      manual: a.manual + c.manual,
      verify: a.verify + c.verify,
    }),
    { errors: 0, manual: 0, verify: 0 },
  );
  const clean = r.bots.filter((b) => b.problems.length === 0).length;
  const to = lastRoute;

  const messages = r.messages.length
    ? el(
        'details',
        { class: 'alert warn' },
        el(
          'summary',
          {},
          icon('warn', 18),
          el(
            'strong',
            {},
            r.messages.length +
              (r.messages.length === 1 ? ' message' : ' messages') +
              ' about the files',
          ),
          el('span', { class: 'more' }, 'Show'),
        ),
        el(
          'ul',
          {},
          r.messages.map((m) => el('li', {}, el('span', { class: 'mfile' }, m.file), m.text)),
        ),
      )
    : null;

  // left: one entry per bot; right: the chosen bot
  const detail = el('div', { class: 'detail' });
  const items = r.bots.map((bot, i) => {
    const c = counts(bot);
    return el(
      'button',
      {
        class: 'botitem',
        type: 'button',
        role: 'tab',
        'aria-selected': 'false',
        onclick: () => select(i),
      },
      el('span', { class: 'botname' }, bot.name),
      el(
        'span',
        { class: 'botmeta' },
        c.errors
          ? chip('blocked sm', 'stop', c.errors + ' errors')
          : chip('auto sm', 'check', 'OK'),
        c.manual ? chip('review sm', 'warn', c.manual + ' manual') : null,
      ),
    );
  });
  function select(i) {
    items.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    detail.replaceChildren(renderBot(r.bots[i], i));
  }
  const workspace = r.bots.length
    ? el(
        'div',
        { class: 'workspace' },
        el(
          'nav',
          { class: 'botlist', role: 'tablist', 'aria-label': 'Converted bots' },
          el('div', { class: 'listhead' }, to.output + ' (' + r.bots.length + ')'),
          items,
        ),
        detail,
      )
    : el('p', { class: 'empty-state' }, 'No bot could be converted from these files.');
  if (r.bots.length) select(0);

  // replaceChildren would print null as text; drop the parts that are not shown
  const parts = [
    el(
      'div',
      { class: 'result-head' },
      el(
        'div',
        { class: 'titles' },
        el('h1', {}, 'Results'),
        el('p', {}, to.output + ' · ' + new Date(r.generatedAt).toLocaleString()),
      ),
      el(
        'button',
        { class: 'secondary', type: 'button', onclick: () => showView('convert') },
        icon('back'),
        'Convert more',
      ),
      r.bots.length
        ? el(
            'button',
            { class: 'secondary accent', type: 'button', onclick: downloadAll },
            icon('download'),
            'Download all (.zip)',
          )
        : null,
    ),
    el(
      'div',
      { class: 'stats' },
      stat(to.output, r.bots.length),
      stat('Passed the ' + to.check.toLowerCase(), clean + ' / ' + r.bots.length),
      stat('Manual items', total.manual),
      to.target === 'ibm-rpa'
        ? stat('Lines to check in Studio', total.verify)
        : stat(
            'Behaviour notes',
            r.bots.map(counts).reduce((a, c) => a + c.semantic, 0),
          ),
    ),
    messages,
    workspace,
    el('p', { class: 'closing' }, icon('info', 16), to.closing),
  ];
  section.replaceChildren(...parts.filter((p) => p !== null));
  renderReport(r);
  $('tab-results').disabled = false;
  $('results-count').textContent = String(r.bots.length);
  $('tab-report').disabled = !r.reportHtml;
  showView('results');
}

function renderReport(r) {
  const view = $('view-report');
  if (!r.reportHtml) {
    view.replaceChildren();
    return;
  }
  // the report is a whole page of its own; shown here in a frame that grows to its height
  const frame = el('iframe', {
    class: 'report-frame',
    title: 'Assessment report',
    sandbox: 'allow-same-origin',
  });
  frame.srcdoc = r.reportHtml;
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (doc)
      frame.style.height =
        Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0) + 'px';
  });
  view.replaceChildren(
    el(
      'div',
      { class: 'result-head' },
      el(
        'div',
        { class: 'titles' },
        el('h1', {}, 'Assessment report'),
        el(
          'p',
          {},
          'Coverage, complexity, effort and source quality of the uploaded bots. Open it on its own to print or save as PDF.',
        ),
      ),
      el(
        'div',
        { class: 'buttons' },
        el(
          'button',
          { class: 'secondary accent', type: 'button', onclick: openReport },
          icon('open', 20),
          'Open the report',
        ),
        el(
          'button',
          {
            class: 'secondary',
            type: 'button',
            onclick: () => save('report.html', last.reportHtml, 'text/html'),
          },
          icon('download'),
          'Download report.html',
        ),
      ),
    ),
    frame,
  );
}

function stat(label, value) {
  return el(
    'div',
    { class: 'stat' },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, value),
  );
}

function renderBot(bot, index) {
  const c = counts(bot);
  const to = lastRoute;
  const id = 'bot' + index;
  const lines = bot.content.replace(/\r?\n$/, '').split(/\r?\n/);
  const kindOf = new Map();
  for (const n of bot.notes) {
    if (n.line === undefined) continue;
    if (n.kind === 'manual' || !kindOf.has(n.line)) kindOf.set(n.line, n.kind);
  }
  const code = el(
    'pre',
    { class: 'code', tabindex: '0', 'aria-label': to.code + ' ' + bot.fileName },
    lines.map((text, i) => {
      const kind = kindOf.get(i + 1);
      const classes = ['ln'];
      if (text.trimStart().startsWith('//')) classes.push('comment');
      if (kind === 'manual' || kind === 'semantic') classes.push(kind);
      return el(
        'span',
        { class: classes.join(' '), id: id + '-l' + (i + 1) },
        text === '' ? ' ' : text,
      );
    }),
  );
  const notes = el(
    'ul',
    { class: 'notes' },
    bot.problems.map((p) =>
      el(
        'li',
        {},
        gotoLine(id, p.line),
        chip('blocked', 'stop', to.check),
        el('span', {}, p.message, p.at ? el('span', { class: 'src' }, p.at) : null),
      ),
    ),
    bot.notes.map((n) =>
      el(
        'li',
        {},
        gotoLine(id, n.line),
        n.kind === 'manual'
          ? chip('review', 'warn', 'Manual')
          : n.kind === 'semantic'
            ? chip('info', 'info', 'Behaviour')
            : chip('auto', 'check', 'Check in Studio'),
        el(
          'span',
          {},
          n.text,
          n.source ? el('span', { class: 'src' }, to.sourceLabel + n.source) : null,
        ),
      ),
    ),
    bot.notes.length + bot.problems.length === 0
      ? el('li', {}, el('span', { class: 'empty' }, 'No notes.'))
      : null,
  );
  const codePanel = el('div', { class: 'panel', role: 'tabpanel', id: id + '-code' }, code);
  const notesPanel = el(
    'div',
    { class: 'panel', role: 'tabpanel', id: id + '-notes', hidden: '' },
    notes,
  );
  const tab = (label, panel, selected) =>
    el(
      'button',
      {
        class: 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(selected),
        'aria-controls': panel.id,
        onclick: (e) => selectTab(e.currentTarget, panel),
      },
      label,
    );

  return el(
    'article',
    { class: 'bot', id },
    el(
      'div',
      { class: 'bot-head' },
      el('h3', {}, bot.name, el('span', { class: 'file' }, bot.fileName)),
      el(
        'div',
        { class: 'bot-chips' },
        c.errors === 0
          ? chip('auto', 'check', to.check + ' OK')
          : chip('blocked', 'stop', c.errors + ' errors'),
        c.manual ? chip('review', 'warn', c.manual + ' manual') : null,
        c.semantic ? chip('info', 'info', c.semantic + ' behaviour') : null,
      ),
      el(
        'button',
        {
          class: 'secondary',
          type: 'button',
          onclick: () => save(bot.fileName, bot.content, to.mime),
        },
        icon('download'),
        bot.fileName.slice(bot.fileName.lastIndexOf('.')),
      ),
      el(
        'button',
        {
          class: 'secondary',
          type: 'button',
          onclick: () => save(bot.name + '.notes.md', bot.notesMarkdown, 'text/markdown'),
        },
        icon('download'),
        'Notes',
      ),
      el(
        'button',
        {
          class: 'secondary',
          type: 'button',
          onclick: async (e) => {
            await navigator.clipboard.writeText(bot.content);
            const b = e.currentTarget;
            b.lastChild.textContent = 'Copied';
            setTimeout(() => (b.lastChild.textContent = 'Copy'), 1500);
          },
        },
        icon('copy'),
        'Copy',
      ),
    ),
    el(
      'div',
      { class: 'tabs', role: 'tablist' },
      tab(to.code, codePanel, true),
      tab('Notes (' + (bot.notes.length + bot.problems.length) + ')', notesPanel, false),
    ),
    codePanel,
    notesPanel,
  );
}

function selectTab(button, panel) {
  const article = button.closest('.bot');
  for (const t of article.querySelectorAll('.tab'))
    t.setAttribute('aria-selected', String(t === button));
  for (const p of article.querySelectorAll('.panel')) p.hidden = p !== panel;
}

function gotoLine(id, line) {
  // A360 notes point at nodes, not lines
  if (line === undefined) return null;
  return el(
    'button',
    {
      class: 'goto',
      type: 'button',
      title: 'Show line ' + line,
      onclick: () => {
        const article = $(id);
        selectTab(article.querySelector('.tab'), $(id + '-code'));
        const target = $(id + '-l' + line);
        if (!target) return;
        target.scrollIntoView({ block: 'center' });
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1600);
      },
    },
    'L' + line,
  );
}

// ---- Downloads ----

function save(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openReport() {
  const url = URL.createObjectURL(new Blob([last.reportHtml], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function downloadAll() {
  const files = [];
  for (const b of last.bots) {
    files.push([b.fileName, b.content], [b.name + '.notes.md', b.notesMarkdown]);
  }
  if (last.reportHtml) files.push(['report.html', last.reportHtml]);
  save(lastRoute.zip, zip(files), 'application/zip');
}

// ---- IBM RPA Studio files ----

/**
 * Script of a .wal file. Studio 30.0.2 saves it inside a protobuf envelope (field 2 is the
 * script); a script saved as text has none. Same rules as readWalFile in source-wal.
 */
async function walText(file) {
  const b = new Uint8Array(await file.arrayBuffer());
  const utf8 = new TextDecoder();
  if (b[0] !== 0x0a || b[1] === 0x0a || b[1] === 0x0d) return utf8.decode(b);
  const varint = (at) => {
    let value = 0;
    let shift = 0;
    let i = at;
    for (;;) {
      if (i >= b.length || shift > 35) throw new Error('truncated');
      const c = b[i++];
      value += (c & 0x7f) * 2 ** shift;
      shift += 7;
      if (c < 0x80) return [value, i];
    }
  };
  try {
    let i = 0;
    while (i < b.length) {
      const [key, next] = varint(i);
      i = next;
      if ((key & 7) === 0) i = varint(i)[1];
      else if ((key & 7) === 2) {
        const [length, start] = varint(i);
        if (key >> 3 === 2) return utf8.decode(b.subarray(start, start + length));
        i = start + length;
      } else break;
    }
  } catch {
    // not an envelope after all
  }
  return utf8.decode(b);
}

// ---- Export zips (read in the browser; the zip itself is never uploaded) ----

const BOT_TYPES = ['application/vnd.aa.taskbot', 'application/vnd.aa.headlessbot'];
/** Data and package files that come with an export; never bots. */
const NOT_BOTS =
  /\.(txt|csv|tsv|xlsx?|xlsm|py|js|vbs|jar|dll|png|jpe?g|gif|pdf|docx?|xml|html?|md)$/i;

/**
 * Task bots of a Control Room export zip, as listed in its manifest.json (same rules as
 * readExportZip in source-a360). Only those entries are inflated, so packages are never read.
 */
async function botsFromZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { files: [], problems: ['not a readable zip'] };
  const utf8 = new TextDecoder();
  const entries = new Map();
  let p = view.getUint32(eocd + 16, true);
  for (let n = view.getUint16(eocd + 10, true); n > 0; n--) {
    if (view.getUint32(p, true) !== 0x02014b50)
      return { files: [], problems: ['corrupt zip directory'] };
    const nameLen = view.getUint16(p + 28, true);
    const name = utf8.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, {
      flags: view.getUint16(p + 8, true),
      method: view.getUint16(p + 10, true),
      size: view.getUint32(p + 20, true),
      local: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  const read = async (e) => {
    if (e.flags & 1) throw new Error('encrypted entry');
    const start =
      e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
    const raw = buf.subarray(start, start + e.size);
    if (e.method === 0) return utf8.decode(raw);
    if (e.method !== 8) throw new Error('compression method ' + e.method);
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry)
    return { files: [], problems: ['no manifest.json: not a Control Room export'] };
  const manifest = JSON.parse(await read(manifestEntry));
  const files = [];
  const problems = [];
  const skipped = new Map();
  for (const f of manifest.files || []) {
    if (typeof f.path !== 'string') continue;
    if (!BOT_TYPES.includes(f.contentType)) {
      skipped.set(f.contentType, (skipped.get(f.contentType) || 0) + 1);
      continue;
    }
    const path = f.path.replace(/\\/g, '/');
    const entry = entries.get(path);
    if (!entry) {
      problems.push(path + ': listed in the manifest but missing from the zip');
      continue;
    }
    try {
      files.push({ name: path.split('/').pop() + '.json', text: await read(entry) });
    } catch (err) {
      problems.push(path + ': ' + (err instanceof Error ? err.message : String(err)));
    }
  }
  for (const [type, n] of skipped)
    if (String(type).startsWith('application/vnd.aa.'))
      problems.push(
        n +
          ' ' +
          type.slice('application/vnd.aa.'.length) +
          ' file(s) not converted (not a task bot)',
      );
  return { files, problems };
}

// Minimal ZIP writer (stored, no compression), so no library is needed.
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, text] of entries) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(local, nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

applyRoute();
renderFiles();
