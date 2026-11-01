/**
 * IBM RPA Studio 30.0.2 saves a `.wal` file as a protobuf message, not as plain text (W-19):
 * field 1 an 18-byte id, field 2 the script, field 3 a number, field 4 another id, field 5 the
 * Studio version (`30.0.2.0`). A script pasted or exported as text has no envelope.
 */
export interface WalFile {
  readonly script: string;
  /** Studio version from the envelope, when there is one. */
  readonly studioVersion?: string;
}

function varint(b: Uint8Array, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    if (i >= b.length || shift > 35) throw new Error('truncated varint');
    const c = b[i++] ?? 0;
    value += (c & 0x7f) * 2 ** shift;
    shift += 7;
    if (c < 0x80) return [value, i];
  }
}

/** The script of a `.wal` file, taken out of the Studio envelope when there is one. */
export function readWalFile(bytes: Uint8Array): WalFile {
  const utf8 = new TextDecoder();
  // plain text starts with a printable character or a BOM; the envelope with field 1 (0x0A)
  if (bytes[0] !== 0x0a || bytes[1] === 0x0a || bytes[1] === 0x0d)
    return { script: utf8.decode(bytes) };
  try {
    const fields = new Map<number, Uint8Array>();
    let i = 0;
    while (i < bytes.length) {
      const [key, next] = varint(bytes, i);
      i = next;
      const type = key & 7;
      if (type === 0) {
        i = varint(bytes, i)[1];
      } else if (type === 2) {
        const [length, start] = varint(bytes, i);
        if (start + length > bytes.length) throw new Error('truncated field');
        fields.set(key >> 3, bytes.subarray(start, start + length));
        i = start + length;
      } else {
        throw new Error(`wire type ${String(type)}`);
      }
    }
    const script = fields.get(2);
    if (!script) throw new Error('no script field');
    const version = fields.get(5);
    return {
      script: utf8.decode(script),
      ...(version ? { studioVersion: utf8.decode(version) } : {}),
    };
  } catch {
    return { script: utf8.decode(bytes) };
  }
}
