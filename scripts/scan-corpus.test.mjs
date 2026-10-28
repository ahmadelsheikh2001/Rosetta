import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { isInternalHost, parseAllowList, readZip, scanFiles, scanText } from './scan-corpus.mjs';

/** Builds a minimal zip; `deflate` picks the compression method. */
function makeZip(files, deflate = true) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const data = deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const rulesFound = (text) => scanText(text).map((f) => f.rule);
const noAllow = parseAllowList('');

describe('scanText', () => {
  it('flags IPv4 addresses', () => {
    expect(rulesFound('host: 10.20.30.40')).toEqual(['ipv4']);
  });

  it('flags internal-looking URLs but not public example ones', () => {
    expect(rulesFound('"http://core-banking.corp/api"')).toEqual(['internal-url']);
    expect(rulesFound('"https://portal/login"')).toEqual(['internal-url']);
    expect(rulesFound('"https://intranet.bank.com/x"')).toEqual(['internal-url']);
    expect(rulesFound('"https://www.example.com/x"')).toEqual([]);
  });

  it('flags UNC paths, also when JSON-escaped', () => {
    expect(rulesFound('\\\\fileserver\\share')).toEqual(['unc-path']);
    expect(rulesFound('"\\\\\\\\fileserver\\\\share"')).toEqual(['unc-path']);
  });

  it('does not mistake a JSON-escaped drive path for a network share', () => {
    expect(rulesFound('"C:\\\\RosettaTest\\\\missing.txt"')).toEqual([]);
    expect(rulesFound('"C:\\RosettaTest\\file"')).toEqual([]);
  });

  it('ignores digit groups inside UUIDs but not the same digits elsewhere', () => {
    expect(rulesFound('"uid":"07c0d7fc-c7ec-4d40-8a65-113955667302"')).toEqual([]);
    expect(rulesFound('"account":"113955667302"')).toEqual(['long-digits']);
  });

  it('flags IBAN-like values and long digit sequences', () => {
    expect(rulesFound('EG380019000500000000263180002')).toContain('iban');
    expect(rulesFound('account 123456789012')).toEqual(['long-digits']);
  });

  it('ignores ordinary numbers and versions', () => {
    expect(rulesFound('version 2.10.3, count 12345')).toEqual([]);
  });

  it('reports 1-based line numbers', () => {
    expect(scanText('ok\nip 192.168.1.1')[0]?.line).toBe(2);
  });
});

describe('isInternalHost', () => {
  it('treats single-label and internal TLD hosts as internal', () => {
    expect(isInternalHost('server01')).toBe(true);
    expect(isInternalHost('app.local:8080')).toBe(true);
    expect(isInternalHost('localhost')).toBe(false);
    expect(isInternalHost('example.org')).toBe(false);
  });
});

describe('readZip', () => {
  it('reads deflated and stored entries, including nested zips', () => {
    const inner = makeZip({ 'deep.json': 'x' }, false);
    const { entries, problems } = readZip(makeZip({ 'bot.json': '{"a":1}', 'inner.zip': inner }));
    expect(problems).toEqual([]);
    expect(entries.map((e) => e.name)).toEqual(['bot.json', 'inner.zip!deep.json']);
    expect(entries[0]?.data.toString()).toBe('{"a":1}');
  });

  it('reports non-zip input as a problem', () => {
    expect(readZip(Buffer.from('not a zip')).problems).toHaveLength(1);
  });
});

describe('scanFiles', () => {
  it('scans inside zip exports and points at the entry', () => {
    const zip = makeZip({ 'bots/Main': '{"url":"http://crm.internal/x"}' });
    const { findings } = scanFiles([{ path: 'corpus/a360/01/export.zip', data: zip }], noAllow);
    expect(findings[0]?.where).toBe('corpus/a360/01/export.zip!bots/Main');
  });

  it('honours the allow-list per value, per path and per file', () => {
    const files = [{ path: 'corpus/a.json', data: Buffer.from('1.2.3.4 and 1234567890123') }];
    expect(scanFiles(files, parseAllowList('1.2.3.4')).findings).toHaveLength(1);
    expect(
      scanFiles(files, parseAllowList('1.2.3.4\ncorpus/a.json::1234567890123')).findings,
    ).toEqual([]);
    expect(
      scanFiles(files, parseAllowList('corpus/a.json::*  # checked by hand')).findings,
    ).toEqual([]);
  });
});

describe('timestamp fields', () => {
  const allow = parseAllowList('timestamp-field:createdOn\ntimestamp-field: updatedOn');
  const scan = (text) => scanFiles([{ path: 'corpus/a.json', data: Buffer.from(text) }], allow);

  it('skips epoch seconds and milliseconds under listed keys, quoted or not', () => {
    expect(scan('{"createdOn": 1698765432100, "updatedOn":"1698765432"}').findings).toEqual([]);
  });

  it('still reports the same values under other keys', () => {
    expect(scan('{"accountNo": 1698765432100}').findings.map((f) => f.rule)).toEqual([
      'long-digits',
    ]);
  });

  it('still reports values under a listed key that are not timestamp-sized', () => {
    expect(scan('{"createdOn": 123456789012}').findings).toHaveLength(1);
  });

  it('starts with no timestamp fields', () => {
    expect(parseAllowList('').timestampFields.size).toBe(0);
  });
});
