import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseArgs } from 'node:util';
import type { Diagnostic } from '@rosetta/ir';
import { loadRegistry, registryDir, type MappingEntry } from '@rosetta/mappings';
import { en, renderHtml, translate } from '@rosetta/report';
import type { StandardsProfile } from '@rosetta/standards';
import { renderNotes } from '@rosetta/target-wal';
import { convertFiles, convertWalFiles, renderA360Notes, type InputFile } from './convert-files.js';
import { ExitCode } from './exit-codes.js';
import { serveHelp } from './help.js';
import type { Io } from './io.js';
import { profileOptions, resolveProfileFrom, UsageError, version } from './options.js';
import { pageHtml } from './web/page.js';

/** Largest request body accepted, in bytes. A360 bot files are a few KB to a few MB. */
export const MAX_BODY = 25 * 1024 * 1024;
const MAX_FILES = 200;

/** Conversions the UI offers (ADR-022: both directions); the page lists others as planned. */
const routes = ['a360>ibm-rpa', 'ibm-rpa>a360'] as const;
type Route = (typeof routes)[number];

/** Only this machine may use the server (ADR-021): the bots never leave it. */
const LOCAL = '127.0.0.1';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  // Everything is inline or data: URIs; nothing is fetched from another origin.
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': type });
  res.end(body);
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
};

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new RequestError(413, `The upload is larger than ${MAX_BODY / 1024 / 1024} MB.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/** Validates the JSON body of `POST /api/convert`. */
function parseRequest(text: string): { route: Route; files: InputFile[] } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RequestError(400, 'The request is not valid JSON.');
  }
  const b = body as { source?: unknown; target?: unknown; files?: unknown };
  const route = routes.find((r) => r === `${String(b.source)}>${String(b.target)}`);
  if (!route) {
    throw new RequestError(400, 'Only A360 → IBM RPA and IBM RPA → A360 are available.');
  }
  if (!Array.isArray(b.files) || b.files.length === 0) {
    throw new RequestError(400, 'No files were uploaded.');
  }
  if (b.files.length > MAX_FILES) {
    throw new RequestError(400, `At most ${MAX_FILES} files per conversion.`);
  }
  const files = b.files.map((f: unknown): InputFile => {
    const file = f as { name?: unknown; text?: unknown };
    if (typeof file.name !== 'string' || typeof file.text !== 'string') {
      throw new RequestError(400, 'Each file needs a name and its text.');
    }
    return { name: file.name, text: file.text };
  });
  return { route, files };
}

const messagesOf = (diagnostics: readonly Diagnostic[]) =>
  diagnostics
    .filter((d) => d.severity !== 'info')
    .map((d) => ({
      file: d.source?.file ?? '',
      severity: d.severity,
      text: translate(en, d.messageId, d.params),
    }));

/**
 * One response shape for both directions. `content` is the generated file; notes and problems
 * carry a `line` for WAL and an `at` (node path) for A360. Only A360 sources get a report.
 */
function convertResponse(
  route: Route,
  files: InputFile[],
  profile: StandardsProfile,
  registry: MappingEntry[],
) {
  const generatedAt = new Date().toISOString();
  if (route === 'ibm-rpa>a360') {
    const result = convertWalFiles(files);
    return {
      generatedAt,
      version,
      bots: result.bots.map((b) => ({
        name: b.name,
        fileName: b.fileName,
        content: b.text,
        notes: b.notes,
        notesMarkdown: renderA360Notes(b),
        problems: b.problems.map((p) => ({ ...p, severity: 'error' })),
      })),
      messages: messagesOf(result.diagnostics),
      reportHtml: null,
    };
  }
  const result = convertFiles(files, profile, registry, generatedAt);
  return {
    generatedAt,
    version,
    bots: result.bots.map((b) => ({
      name: b.name,
      fileName: b.script.fileName,
      content: b.script.text,
      notes: b.script.notes,
      notesMarkdown: renderNotes(b.script.fileName, b.script.notes, b.problems),
      problems: b.problems,
    })),
    messages: messagesOf(result.diagnostics),
    reportHtml: renderHtml(result.assessment),
  };
}

export interface RunningServer {
  readonly server: Server;
  readonly url: string;
}

/** Starts the local UI and API on 127.0.0.1. `port` 0 picks a free port. */
export function startServer(profile: StandardsProfile, port: number): Promise<RunningServer> {
  const registry = loadRegistry(registryDir);
  if (registry.problems.length > 0) {
    return Promise.reject(
      new Error(`Mapping registry is invalid: ${registry.problems.map((p) => p.file).join(', ')}`),
    );
  }
  const entries = registry.entries.map((e) => e.entry);
  const page = pageHtml();

  const server = createServer((req, res) => {
    const actual = (server.address() as AddressInfo).port;
    // Refuse requests addressed to another host name (DNS rebinding).
    const host = req.headers.host ?? '';
    if (host !== `${LOCAL}:${actual}` && host !== `localhost:${actual}`) {
      send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
      return;
    }
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && path === '/') {
      send(res, 200, 'text/html; charset=utf-8', page);
      return;
    }
    if (path === '/api/convert') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'Use POST.' });
        return;
      }
      // JSON only: a cross-site form cannot send it without a preflight, which is never allowed.
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        json(res, 415, { error: 'Send the files as JSON.' });
        return;
      }
      readBody(req)
        .then((text) => {
          const { route, files } = parseRequest(text);
          json(res, 200, convertResponse(route, files, profile, entries));
        })
        .catch((err: unknown) => {
          if (err instanceof RequestError) json(res, err.status, { error: err.message });
          else json(res, 500, { error: 'The conversion failed unexpectedly.' });
        });
      return;
    }
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOCAL, () => {
      const { port: actual } = server.address() as AddressInfo;
      resolve({ server, url: `http://${LOCAL}:${actual}/` });
    });
  });
}

/** `rosetta serve`: the web UI. Keeps running until stopped (Ctrl+C). */
export function serveCommand(args: readonly string[], io: Io): number {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: { ...profileOptions, port: { type: 'string' } },
      strict: true,
    }));
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
  if (values.help) {
    io.out(serveHelp);
    return ExitCode.Ok;
  }
  const port = Number(values.port ?? '4173');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new UsageError(`--port must be a number from 0 to 65535, got "${values.port ?? ''}"`);
  }
  const { profile } = resolveProfileFrom(values, io);
  startServer(profile, port).then(
    ({ url }) => {
      io.out(
        `RPA Rosetta is running at ${url}\nOpen it in your browser. Files stay on this computer.\nPress Ctrl+C to stop.\n`,
      );
    },
    (err: unknown) => {
      io.err(`Could not start the server: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = ExitCode.Internal;
    },
  );
  return ExitCode.Ok;
}
