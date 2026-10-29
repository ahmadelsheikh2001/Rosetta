#!/usr/bin/env node
import { run } from './run.js';

// `pnpm rosetta -- <args>` forwards a literal `--`; drop it.
const args = process.argv.slice(2);
process.exitCode = run(args[0] === '--' ? args.slice(1) : args, {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  cwd: process.cwd(),
});
