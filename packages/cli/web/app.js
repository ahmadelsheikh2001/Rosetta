// RPA Rosetta web UI. Talks only to this server (127.0.0.1); nothing leaves the computer.
'use strict';

const $ = (id) => document.getElementById(id);
const chosen = new Map(); // file name → File
let last = null; // last conversion response

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
const kb = (n) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB');

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
    const files = await Promise.all(
      [...chosen.values()].map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: $('source').value, target: $('target').value, files }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'The conversion failed.');
    last = body;
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
  const section = $('result');
  const total = r.bots.map(counts).reduce(
    (a, c) => ({
      errors: a.errors + c.errors,
      manual: a.manual + c.manual,
      verify: a.verify + c.verify,
    }),
    { errors: 0, manual: 0, verify: 0 },
  );
  const clean = r.bots.filter((b) => b.problems.length === 0).length;

  const messages = r.messages.length
    ? el(
        'div',
        { class: 'alert warn', role: 'status' },
        icon('warn', 18),
        el(
          'div',
          {},
          el('strong', {}, 'Some files could not be read completely'),
          el(
            'ul',
            {},
            r.messages.map((m) => el('li', {}, m.file + ': ' + m.text)),
          ),
        ),
      )
    : null;

  // replaceChildren would print null as text; drop the parts that are not shown
  const parts = [
    el(
      'div',
      { class: 'result-head' },
      el('h2', {}, el('span', { class: 'step' }, '3'), 'Result'),
      r.bots.length
        ? el(
            'button',
            { class: 'secondary', type: 'button', onclick: downloadAll },
            icon('download'),
            'Download all (.zip)',
          )
        : null,
      r.bots.length
        ? el(
            'button',
            { class: 'secondary', type: 'button', onclick: openReport },
            icon('open'),
            'Open assessment report',
          )
        : null,
    ),
    el(
      'div',
      { class: 'stats' },
      stat('IBM RPA scripts', r.bots.length),
      stat('Passed the static check', clean + ' / ' + r.bots.length),
      stat('Manual items', total.manual),
      stat('Lines to check in Studio', total.verify),
    ),
    messages,
    r.bots.length === 0 ? el('p', {}, 'No bot could be converted from these files.') : null,
    ...r.bots.map(renderBot),
    el(
      'p',
      { class: 'lead' },
      'The IBM RPA scripts are a draft: open each one in IBM RPA Studio, run it and compare the result with the A360 bot.',
    ),
  ];
  section.replaceChildren(...parts.filter((p) => p !== null));
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const id = 'bot' + index;
  const lines = bot.wal.replace(/\r\n$/, '').split('\r\n');
  const kindOf = new Map();
  for (const n of bot.notes) {
    if (n.kind === 'manual' || !kindOf.has(n.line)) kindOf.set(n.line, n.kind);
  }
  const code = el(
    'pre',
    { class: 'code', tabindex: '0', 'aria-label': 'IBM RPA script ' + bot.fileName },
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
        chip('blocked', 'stop', 'Static check'),
        el('span', {}, p.message),
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
        el('span', {}, n.text, n.source ? el('span', { class: 'src' }, 'A360: ' + n.source) : null),
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
      c.errors === 0
        ? chip('auto', 'check', 'Static check OK')
        : chip('blocked', 'stop', c.errors + ' errors'),
      c.manual ? chip('review', 'warn', c.manual + ' manual') : null,
      c.semantic ? chip('info', 'info', c.semantic + ' behaviour') : null,
      el(
        'button',
        {
          class: 'secondary',
          type: 'button',
          onclick: () => save(bot.fileName, bot.wal, 'text/plain'),
        },
        icon('download'),
        '.wal',
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
            await navigator.clipboard.writeText(bot.wal);
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
      tab('IBM RPA script', codePanel, true),
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
    files.push([b.fileName, b.wal], [b.name + '.notes.md', b.notesMarkdown]);
  }
  files.push(['report.html', last.reportHtml]);
  save('rosetta-ibm-rpa.zip', zip(files), 'application/zip');
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

renderFiles();
