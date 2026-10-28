/**
 * Corpus safety scan, run by the pre-commit hook.
 *
 * Blocks commits that add obviously real-world data under corpus/: IPv4
 * addresses, internal-looking URLs, UNC paths, IBAN-like and long digit
 * sequences. Zip files (A360 exports) are scanned entry by entry. False
 * positives are expected; allow-list them in corpus/.scanallow.
 *
 * Usage: node scripts/scan-corpus.mjs          (staged files, used by the hook)
 *        node scripts/scan-corpus.mjs --all    (whole corpus/ working tree)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const CORPUS_DIR = 'corpus';
export const ALLOW_FILE = 'corpus/.scanallow';

const SKIPPED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp'];
const INTERNAL_TLDS = [
  'local',
  'internal',
  'corp',
  'lan',
  'intranet',
  'intra',
  'home',
  'localdomain',
  'priv',
];
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;

/** Returns true for hosts that look like they belong to a private network. */
export function isInternalHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/:\d+$/, '');
  if (host === 'localhost' || IPV4.test(host)) return false; // IPs are reported by the ipv4 rule
  const labels = host.split('.');
  if (labels.length === 1) return true;
  if (INTERNAL_TLDS.includes(labels.at(-1) ?? '')) return true;
  return labels.some((l) => /intranet|internal|corp|^int$|-int$/.test(l));
}

/** @typedef {{ rule: string, value: string, line: number }} Finding */

/** Scan rules. Each returns the suspicious values found in `text`. */
export const rules = [
  {
    id: 'ipv4',
    description: 'IP address',
    find: (text) => text.match(new RegExp(IPV4.source, 'g')) ?? [],
  },
  {
    id: 'internal-url',
    description: 'internal-looking URL',
    find: (text) =>
      (text.match(/\bhttps?:\/\/[^\s"'<>\\]+/gi) ?? []).filter((url) => {
        const host = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? '';
        return isInternalHost(host.replace(/^[^@]*@/, ''));
      }),
  },
  {
    id: 'unc-path',
    description: 'network share path',
    find: (text) => text.match(/\\{2,}[A-Za-z0-9._-]+\\{1,2}[A-Za-z0-9$._-]+/g) ?? [],
  },
  {
    id: 'iban',
    description: 'IBAN-like account number',
    find: (text) => text.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g) ?? [],
  },
  {
    id: 'long-digits',
    description: 'long digit sequence (account/card number?)',
    // Epoch timestamps (10 digits = seconds, 13 = milliseconds) are skipped when they are the
    // value of a JSON key listed as a timestamp field in the allow-list.
    find: (text, { timestampFields }) =>
      [...text.matchAll(/(?<![\d.])\d{10,}(?![\d.])/g)]
        .filter((m) => {
          if (m[0].length !== 10 && m[0].length !== 13) return true;
          const key = /"([^"\\]+)"\s*:\s*"?$/.exec(text.slice(0, m.index))?.[1];
          return key === undefined || !timestampFields.has(key);
        })
        .map((m) => m[0]),
  },
];

/**
 * Scans one text and returns findings with 1-based line numbers.
 * @param {{ timestampFields?: Set<string> }} [options]
 */
export function scanText(text, { timestampFields = new Set() } = {}) {
  /** @type {Finding[]} */
  const findings = [];
  text.split(/\r?\n/).forEach((lineText, i) => {
    for (const rule of rules) {
      for (const value of rule.find(lineText, { timestampFields })) {
        findings.push({ rule: rule.id, value, line: i + 1 });
      }
    }
  });
  return findings;
}

/**
 * Lists the entries of a zip archive (stored or deflated). Nested zips are expanded.
 * Unreadable parts are returned as problems instead of throwing.
 * @returns {{ entries: { name: string, data: Buffer }[], problems: string[] }}
 */
export function readZip(buf, prefix = '') {
  const entries = [];
  const problems = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { entries, problems: [`${prefix || 'archive'}: not a readable zip`] };

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff)
    return { entries, problems: [`${prefix || 'archive'}: ZIP64 not supported`] };

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      problems.push(`${prefix || 'archive'}: corrupt central directory`);
      break;
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = prefix + buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (flags & 1) {
      problems.push(`${name}: encrypted entry, cannot scan`);
      continue;
    }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    let data;
    try {
      if (method === 0) data = raw;
      else if (method === 8) data = inflateRawSync(raw);
      else {
        problems.push(`${name}: unsupported compression method ${method}`);
        continue;
      }
    } catch (err) {
      problems.push(`${name}: ${String(err)}`);
      continue;
    }
    if (name.toLowerCase().endsWith('.zip')) {
      const inner = readZip(data, `${name}!`);
      entries.push(...inner.entries);
      problems.push(...inner.problems);
    } else {
      entries.push({ name, data });
    }
  }
  return { entries, problems };
}

/**
 * Parses the allow-list. Each line is either `<value>` (allowed in any file),
 * `<path>::<value>`, `<path>::*` (skip that file), or `timestamp-field:<json key>`
 * (epoch timestamps under that key are not reported). `#` starts a comment.
 */
export function parseAllowList(text) {
  const any = new Set();
  /** @type {Set<string>} */
  const timestampFields = new Set();
  /** @type {Map<string, Set<string>>} */
  const byPath = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('timestamp-field:')) {
      timestampFields.add(line.slice('timestamp-field:'.length).trim());
      continue;
    }
    const sepAt = line.indexOf('::');
    if (sepAt < 0) {
      any.add(line);
      continue;
    }
    const path = line.slice(0, sepAt);
    const set = byPath.get(path) ?? new Set();
    set.add(line.slice(sepAt + 2));
    byPath.set(path, set);
  }
  return {
    timestampFields,
    allows: (path, value) =>
      any.has(value) ||
      (byPath.get(path)?.has(value) ?? false) ||
      (byPath.get(path)?.has('*') ?? false),
    skipsFile: (path) => byPath.get(path)?.has('*') ?? false,
  };
}

/**
 * Scans named file contents. Returns findings (with display path) and problems.
 * @param {{ path: string, data: Buffer }[]} files
 */
export function scanFiles(files, allow) {
  const findings = [];
  const problems = [];
  for (const { path, data } of files) {
    if (path === ALLOW_FILE || allow.skipsFile(path)) continue;
    if (SKIPPED_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) continue;
    const parts = path.toLowerCase().endsWith('.zip')
      ? (() => {
          const zip = readZip(data);
          problems.push(...zip.problems.map((p) => `${path}!${p}`));
          return zip.entries.map((e) => ({ where: `${path}!${e.name}`, data: e.data }));
        })()
      : [{ where: path, data }];
    for (const part of parts) {
      for (const f of scanText(part.data.toString('utf8'), allow)) {
        if (!allow.allows(path, f.value)) findings.push({ ...f, where: part.where });
      }
    }
  }
  return { findings, problems };
}

function stagedCorpusFiles() {
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--', CORPUS_DIR],
    { encoding: 'utf8' },
  );
  return out
    .split('\0')
    .filter(Boolean)
    .map((path) => ({
      path,
      data: execFileSync('git', ['show', `:${path}`], { maxBuffer: 1 << 30 }),
    }));
}

function workingTreeCorpusFiles() {
  if (!existsSync(CORPUS_DIR)) return [];
  return readdirSync(CORPUS_DIR, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => {
      const full = join(d.parentPath, d.name);
      return { path: relative('.', full).split(sep).join('/'), data: readFileSync(full) };
    });
}

function main() {
  const files = process.argv.includes('--all') ? workingTreeCorpusFiles() : stagedCorpusFiles();
  const allow = parseAllowList(existsSync(ALLOW_FILE) ? readFileSync(ALLOW_FILE, 'utf8') : '');
  const { findings, problems } = scanFiles(files, allow);

  if (findings.length === 0 && problems.length === 0) return;

  const describe = Object.fromEntries(rules.map((r) => [r.id, r.description]));
  console.error('\n✖ Corpus safety scan blocked this commit.\n');
  for (const f of findings) {
    console.error(`  ${f.where}:${f.line}  ${describe[f.rule]}  "${f.value}"`);
  }
  for (const p of problems) console.error(`  ${p}  (could not be scanned)`);
  console.error(
    [
      '',
      'The corpus must contain synthetic or fully sanitised data only (see corpus/README.md).',
      'If a finding is real data: remove it from the file and re-export.',
      `If it is a false positive: add it to ${ALLOW_FILE}, one per line:`,
      '  <value>                   allowed in any corpus file',
      '  <path>::<value>           allowed in that file only',
      '  <path>::*                 skip that file (only after checking it by hand)',
      '',
    ].join('\n'),
  );
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
