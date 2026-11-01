import { inflateRawSync } from 'node:zlib';

/** A bot file taken out of a Control Room export zip. */
export interface ExportFile {
  /** Repository path from the manifest, forward slashes. */
  readonly path: string;
  readonly text: string;
}

export interface ExportResult {
  readonly files: readonly ExportFile[];
  /** Why the zip, or part of it, could not be read. */
  readonly problems: readonly string[];
}

/** Bot content types in an export manifest (Bot Store and GitHub exports, A-25). */
const BOT_TYPES = new Set(['application/vnd.aa.taskbot', 'application/vnd.aa.headlessbot']);

interface Entry {
  readonly name: string;
  readonly method: number;
  readonly flags: number;
  readonly size: number;
  readonly local: number;
}

/** Central directory of a zip (stored or deflated entries; no ZIP64). */
function entries(buf: Buffer): Entry[] | string {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return 'not a readable zip';
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) return 'ZIP64 archives are not supported';
  const out: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50)
      return 'corrupt central directory';
    const nameLen = buf.readUInt16LE(p + 28);
    out.push({
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      size: buf.readUInt32LE(p + 20),
      local: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

function read(buf: Buffer, e: Entry): Buffer {
  if (e.flags & 1) throw new Error('encrypted entry');
  const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  const raw = buf.subarray(start, start + e.size);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`compression method ${String(e.method)}`);
}

/**
 * Reads the bots of a Control Room export zip: `manifest.json` lists every file with its content
 * type; only task bots and API task bots are taken. Packages (jars), forms, AI agents and other
 * files are left unread, so a large export costs only its bots.
 */
export function readExportZip(data: Uint8Array): ExportResult {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const list = entries(buf);
  if (typeof list === 'string') return { files: [], problems: [list] };
  const byName = new Map(list.map((e) => [e.name, e]));
  const manifestEntry = byName.get('manifest.json');
  if (!manifestEntry)
    return { files: [], problems: ['no manifest.json: not a Control Room export'] };
  let manifest: { files?: { path?: unknown; contentType?: unknown }[] };
  try {
    manifest = JSON.parse(read(buf, manifestEntry).toString('utf8')) as typeof manifest;
  } catch (err) {
    return {
      files: [],
      problems: [`manifest.json: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  const files: ExportFile[] = [];
  const problems: string[] = [];
  const skipped = new Map<string, number>();
  for (const f of manifest.files ?? []) {
    if (typeof f.path !== 'string') continue;
    const type = typeof f.contentType === 'string' ? f.contentType : '?';
    if (!BOT_TYPES.has(type)) {
      skipped.set(type, (skipped.get(type) ?? 0) + 1);
      continue;
    }
    const path = f.path.replace(/\\/g, '/');
    const entry = byName.get(path);
    if (!entry) {
      problems.push(`${path}: listed in the manifest but missing from the zip`);
      continue;
    }
    try {
      files.push({ path, text: read(buf, entry).toString('utf8') });
    } catch (err) {
      problems.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const [type, n] of skipped)
    if (type.startsWith('application/vnd.aa.'))
      problems.push(
        `${String(n)} ${type.slice('application/vnd.aa.'.length)} file(s) not converted (not a task bot)`,
      );
  return { files, problems };
}
