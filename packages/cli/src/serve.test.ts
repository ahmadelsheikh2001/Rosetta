import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defaultProfile } from '@rosetta/standards';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from './serve.js';

const corpus = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../corpus/a360/${path}`, import.meta.url)), 'utf8');

const golden = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../golden/wal/${name}`, import.meta.url)), 'utf8');

let running: RunningServer;
beforeAll(async () => {
  running = await startServer(defaultProfile, 0);
});
afterAll(() => {
  running.server.close();
});

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Raw HTTP so the Host header can be set (fetch does not allow it). */
function call(
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const url = new URL(path, running.url);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { Host: url.host, ...headers },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const convert = (payload: unknown) =>
  call('POST', '/api/convert', JSON.stringify(payload), { 'Content-Type': 'application/json' });

describe('rosetta serve', () => {
  it('listens on 127.0.0.1 only', () => {
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it('serves the page with the logo, inline assets and a strict content policy', async () => {
    const r = await call('GET', '/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('alt="Valleysoft"');
    expect(r.body).toContain('Convert to IBM RPA');
    expect(r.body).toContain('<option value="ibm-rpa">IBM RPA (WAL script)</option>');
    expect(r.body).toContain('Automation Anywhere A360 (task bot)');
    expect(r.body).not.toMatch(/(src|href)="https?:/i);
    expect(r.body).not.toMatch(/<link|@import/i);
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(String(r.headers['content-security-policy'])).toContain("connect-src 'self'");
  });

  it('converts uploaded A360 files to IBM RPA scripts with notes and a report', async () => {
    const r = await convert({
      source: 'a360',
      target: 'ibm-rpa',
      files: [
        { name: 'RR_08_Parent.json', text: corpus('08-subbot-credentials/RR_08_Parent.json') },
        { name: 'RR_08_Child.json', text: corpus('08-subbot-credentials/RR_08_Child.json') },
      ],
    });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as {
      bots: { name: string; fileName: string; content: string; problems: unknown[] }[];
      messages: unknown[];
      reportHtml: string;
    };
    expect(body.bots.map((b) => b.fileName)).toEqual(['RR_08_Parent.wal', 'RR_08_Child.wal']);
    expect(body.bots[0]?.content).toContain('executeScript --name "RR_08_Child"');
    expect(body.bots.every((b) => b.problems.length === 0)).toBe(true);
    expect(body.messages).toEqual([]);
    expect(body.reportHtml).toContain('RR_08_Parent');
  });

  it('converts uploaded IBM RPA scripts to A360 task bots that pass the A360 check', async () => {
    const r = await convert({
      source: 'ibm-rpa',
      target: 'a360',
      files: [{ name: '03-strings-expressions.wal', text: golden('03-strings-expressions.wal') }],
    });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as {
      bots: { fileName: string; content: string; problems: unknown[]; notesMarkdown: string }[];
      messages: unknown[];
      reportHtml: string | null;
    };
    expect(body.bots.map((b) => b.fileName)).toEqual(['03-strings-expressions.json']);
    const bot = JSON.parse(body.bots[0]?.content ?? '') as { packages: { name: string }[] };
    expect(bot.packages.map((p) => p.name)).toContain('System');
    expect(body.bots[0]?.problems).toEqual([]);
    expect(body.bots[0]?.notesMarkdown).toContain(
      '# 03-strings-expressions.json: conversion notes',
    );
    expect(body.messages).toEqual([]);
    expect(body.reportHtml).toBeNull();
  });

  it('uses the locker and folder given for IBM RPA → A360, and refuses unsafe ones', async () => {
    const files = [{ name: 'RR_08_Parent.wal', text: golden('RR_08_Parent.wal') }];
    const r = await convert({
      source: 'ibm-rpa',
      target: 'a360',
      files,
      options: { vaultLocker: 'RosettaTest', botFolder: 'Bots/RPA_Rosetta_Samples' },
    });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as { bots: { content: string; notes: unknown[] }[] };
    const content = body.bots[0]?.content ?? '';
    expect(content).toContain('"lockerName": "RosettaTest"');
    expect(content).toContain('Bots/RPA_Rosetta_Samples/RR_08_Child');
    expect(body.bots[0]?.notes).toEqual([]);

    const bad = await convert({
      source: 'ibm-rpa',
      target: 'a360',
      files,
      options: { botFolder: 'Bots/../Other' },
    });
    expect(bad.status).toBe(400);
  });

  it('reports files that are not A360 bots instead of failing', async () => {
    const r = await convert({
      source: 'a360',
      target: 'ibm-rpa',
      files: [{ name: 'notes.json', text: 'not json' }],
    });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as {
      bots: unknown[];
      messages: { file: string; text: string }[];
    };
    expect(body.bots).toEqual([]);
    expect(body.messages[0]).toMatchObject({ file: 'notes.json' });
    expect(body.messages[0]?.text).toMatch(/Not valid JSON/);
  });

  it('accepts only the available conversions', async () => {
    const r = await convert({
      source: 'uipath',
      target: 'ibm-rpa',
      files: [{ name: 'a', text: '' }],
    });
    expect(r.status).toBe(400);
  });

  it('refuses requests addressed to another host name (DNS rebinding)', async () => {
    const r = await call('GET', '/', undefined, { Host: 'attacker.example:80' });
    expect(r.status).toBe(403);
  });

  it('accepts uploads only as JSON, so a cross-site form cannot post', async () => {
    const r = await call('POST', '/api/convert', 'files=x', {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(r.status).toBe(415);
  });
});
