import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readExportZip } from './export.js';

/** A minimal zip writer (deflated entries), to build export fixtures in the test. */
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

const manifest = (files: [string, string][]) =>
  JSON.stringify({ files: files.map(([path, contentType]) => ({ path, contentType })) });

describe('readExportZip', () => {
  it('reads the task bots and API task bots listed in the manifest, nothing else', () => {
    const r = readExportZip(
      zip({
        'manifest.json': manifest([
          ['Automation Anywhere\\Bots\\Demo\\Main', 'application/vnd.aa.taskbot'],
          ['Automation Anywhere\\Bots\\Demo\\Api', 'application/vnd.aa.headlessbot'],
          ['Automation Anywhere\\Bots\\Demo\\Form', 'application/vnd.aa.form'],
        ]),
        'Automation Anywhere/Bots/Demo/Main': '{"nodes":[]}',
        'Automation Anywhere/Bots/Demo/Api': '{"nodes":[1]}',
        'Automation Anywhere/Bots/Demo/Form': '{}',
        'bot-command-string-5.12.6.jar': 'not read',
      }),
    );
    expect(r.files).toEqual([
      { path: 'Automation Anywhere/Bots/Demo/Main', text: '{"nodes":[]}' },
      { path: 'Automation Anywhere/Bots/Demo/Api', text: '{"nodes":[1]}' },
    ]);
    expect(r.problems).toEqual(['1 form file(s) not converted (not a task bot)']);
  });

  it('reports a zip that is not a Control Room export', () => {
    expect(readExportZip(zip({ 'a.txt': 'x' })).problems).toEqual([
      'no manifest.json: not a Control Room export',
    ]);
    expect(readExportZip(Buffer.from('not a zip')).problems).toEqual(['not a readable zip']);
  });
});
