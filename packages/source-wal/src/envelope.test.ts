import { describe, expect, it } from 'vitest';
import { readWalFile } from './envelope.js';

/** A Studio 30.0.2 file: field 1 id, field 2 script, field 3 number, field 5 version (W-19). */
function studioFile(script: string): Uint8Array {
  const text = new TextEncoder().encode(script);
  const length: number[] = [];
  for (let n = text.length; ; n >>= 7) {
    length.push(n < 0x80 ? n : (n & 0x7f) | 0x80);
    if (n < 0x80) break;
  }
  const version = new TextEncoder().encode('30.0.2.0');
  return new Uint8Array([
    0x0a,
    3,
    9,
    0x3f,
    0xd7,
    0x12,
    ...length,
    ...text,
    0x18,
    2,
    0x2a,
    version.length,
    ...version,
  ]);
}

describe('readWalFile', () => {
  it('takes the script out of the Studio envelope', () => {
    const script = 'defVar --name a --type String\r\n'.repeat(20);
    expect(readWalFile(studioFile(script))).toEqual({ script, studioVersion: '30.0.2.0' });
  });

  it('reads a script saved as text as it is', () => {
    const script = 'defVar --name a --type String\r\n';
    expect(readWalFile(new TextEncoder().encode(script))).toEqual({ script });
    expect(readWalFile(new TextEncoder().encode(`\n${script}`)).script).toBe(`\n${script}`);
  });
});
