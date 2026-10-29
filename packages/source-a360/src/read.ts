import type { Bot, Diagnostic } from '@rosetta/ir';
import { LiftCode, LiftContext, type MappingLookup } from './context.js';
import { liftBot } from './lift.js';
import { sourceBot } from './schema.js';

export interface ReadOptions {
  /** Path shown in reports and used as the bot id, forward slashes. */
  readonly file: string;
  /** Display name; the bot JSON itself carries none. */
  readonly name: string;
  /** Registry lookup; omit to treat every command as unregistered. */
  readonly lookup?: MappingLookup;
}

export interface ReadResult {
  /** Absent when the file is not a readable bot. */
  readonly bot?: Bot;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads one A360 task bot file (the raw content, `application/vnd.aa.taskbot`)
 * and lifts it to IR. Never throws on bad input.
 */
export function readBotJson(text: string, options: ReadOptions): ReadResult {
  const ctx = new LiftContext(options.file, options.lookup ?? (() => undefined));
  const at = ctx.ref([]);

  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    ctx.report(
      LiftCode.Json,
      'error',
      { file: options.file, detail: err instanceof Error ? err.message : String(err) },
      at,
    );
    return { diagnostics: ctx.diagnostics };
  }

  const parsed = sourceBot.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    ctx.report(
      LiftCode.Schema,
      'error',
      { file: options.file, path: first?.path.join('.') ?? '', detail: first?.message ?? '' },
      at,
    );
    return { diagnostics: ctx.diagnostics };
  }

  return { bot: liftBot(parsed.data, options.name, ctx), diagnostics: ctx.diagnostics };
}
