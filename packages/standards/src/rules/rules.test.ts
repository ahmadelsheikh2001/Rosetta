import {
  action,
  bot,
  comment,
  group,
  ifThen,
  lit,
  loopTimes,
  ref,
  tryCatch,
  variable,
  type Block,
  type Statement,
} from '@rosetta/ir';
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '../defaults.js';
import { resolveProfile } from '../layers.js';
import { ruleCatalog } from './catalog.js';
import { deepNesting } from './deep-nesting.js';
import { disabledCode } from './disabled-code.js';
import { emptyCatch } from './empty-catch.js';
import { hardcodedCredential } from './hardcoded-credential.js';
import { checkBot, pendingRules } from './engine.js';
import { missingComments } from './missing-comments.js';
import { missingErrorHandling } from './missing-error-handling.js';
import { unusedVariable } from './unused-variable.js';

const work = (): Statement => action('file.copy');
const nest = (levels: number, inner: Block): Block =>
  levels === 0 ? inner : [ifThen(lit(true), nest(levels - 1, inner))];

describe('missing-error-handling', () => {
  it('flags a bot doing work without any Try', () => {
    expect(missingErrorHandling.check(bot('b', [work(), work()]), defaultProfile)).toEqual([
      { params: { actions: 2 } },
    ]);
  });

  it('passes when a Try exists', () => {
    const b = bot('b', [tryCatch([work()], [{ body: [work()] }])]);
    expect(missingErrorHandling.check(b, defaultProfile)).toEqual([]);
  });

  it('ignores a disabled Try and empty bots', () => {
    const disabledTry = { ...tryCatch([work()], [{ body: [work()] }]), disabled: true };
    expect(missingErrorHandling.check(bot('b', [disabledTry]), defaultProfile)).toHaveLength(1);
    expect(missingErrorHandling.check(bot('b', [comment('x')]), defaultProfile)).toEqual([]);
  });
});

describe('empty-catch', () => {
  it('flags a catch that is empty or only has comments/disabled statements', () => {
    const t = tryCatch(
      [work()],
      [
        { body: [] },
        { body: [comment('todo'), { ...work(), disabled: true }] },
        { body: [work()] },
      ],
    );
    expect(emptyCatch.check(bot('b', [t]), defaultProfile).map((f) => f.params)).toEqual([
      { catch: 1 },
      { catch: 2 },
    ]);
  });

  it('passes a catch that handles the error', () => {
    const t = tryCatch([work()], [{ body: [action('log.write')] }]);
    expect(emptyCatch.check(bot('b', [t]), defaultProfile)).toEqual([]);
  });
});

describe('deep-nesting', () => {
  const max = defaultProfile.quality.maxNestingDepth;

  it('passes at exactly the maximum depth', () => {
    expect(deepNesting.check(bot('b', nest(max, [work()])), defaultProfile)).toEqual([]);
  });

  it('flags once at the first level beyond the maximum', () => {
    const findings = deepNesting.check(bot('b', nest(max + 2, [work()])), defaultProfile);
    expect(findings.map((f) => f.params)).toEqual([{ level: max + 1, max }]);
  });

  it('does not count Steps (groups) as nesting', () => {
    const wrapped: Block = [group('Step', [group('Inner', nest(max, [work()]))])];
    expect(deepNesting.check(bot('b', wrapped), defaultProfile)).toEqual([]);
  });

  it('uses the threshold from the profile', () => {
    const { profile } = resolveProfile([
      { name: 'project', source: 'p', data: { quality: { maxNestingDepth: 1 } } },
    ]);
    expect(deepNesting.check(bot('b', nest(2, [work()])), profile)).toHaveLength(1);
  });
});

describe('disabled-code', () => {
  it('reports disabled statements but not their children again', () => {
    const disabledLoop = { ...loopTimes(3, [{ ...work(), disabled: true }]), disabled: true };
    const findings = disabledCode.check(bot('b', [work(), disabledLoop]), defaultProfile);
    expect(findings.map((f) => f.node?.id)).toEqual([disabledLoop.id]);
  });

  it('passes when nothing is disabled', () => {
    expect(disabledCode.check(bot('b', [work()]), defaultProfile)).toEqual([]);
  });
});

describe('unused-variable', () => {
  it('flags locals that are never referenced', () => {
    const b = bot('b', [action('string.upper', { args: { text: ref('used') } })], {
      variables: [variable('used'), variable('unused')],
    });
    expect(unusedVariable.check(b, defaultProfile).map((f) => f.params)).toEqual([
      { variable: 'unused' },
    ]);
  });

  it('never flags inputs and outputs', () => {
    const b = bot('b', [], {
      variables: [
        variable('in', undefined, { direction: 'input' }),
        variable('out', undefined, { direction: 'output' }),
      ],
    });
    expect(unusedVariable.check(b, defaultProfile)).toEqual([]);
  });

  it('counts references in other variables defaults and in conditions', () => {
    const b = bot('b', [ifThen(ref('flag'), [])], {
      variables: [
        variable('flag'),
        variable('base'),
        variable('derived', undefined, { defaultValue: ref('base') }),
      ],
    });
    expect(unusedVariable.check(b, defaultProfile).map((f) => f.params)).toEqual([
      { variable: 'derived' },
    ]);
  });
});

describe('missing-comments', () => {
  const many = (n: number): Block => Array.from({ length: n }, work);
  const limit = defaultProfile.quality.commentsRequiredAbove;

  it('flags a large bot with no comment and no Step', () => {
    expect(missingComments.check(bot('b', many(limit + 1)), defaultProfile)).toHaveLength(1);
  });

  it('passes small bots and documented bots', () => {
    expect(missingComments.check(bot('b', many(limit)), defaultProfile)).toEqual([]);
    expect(
      missingComments.check(bot('b', [comment('why'), ...many(limit + 5)]), defaultProfile),
    ).toEqual([]);
    expect(
      missingComments.check(bot('b', [group('Step', many(limit + 5))]), defaultProfile),
    ).toEqual([]);
  });
});

describe('hardcoded-credential', () => {
  const cred = (defaultValue?: string) =>
    variable(
      'secret',
      { kind: 'credential' },
      {
        sensitive: true,
        ...(defaultValue === undefined ? {} : { defaultValue: lit(defaultValue) }),
      },
    );

  it('flags a credential variable with a literal value', () => {
    const findings = hardcodedCredential.check(
      bot('b', [], { variables: [cred('hunter2')] }),
      defaultProfile,
    );
    expect(findings.map((f) => [f.variable?.name, f.params])).toEqual([
      ['secret', { variable: 'secret' }],
    ]);
  });

  it('passes credentials without a value or with an empty one, and non-credentials', () => {
    const vars = [
      cred(),
      cred(''),
      variable('name', { kind: 'string' }, { defaultValue: lit('x') }),
    ];
    expect(hardcodedCredential.check(bot('b', [], { variables: vars }), defaultProfile)).toEqual(
      [],
    );
  });
});

describe('checkBot', () => {
  const messy = bot('messy', [work(), { ...work(), disabled: true }], {
    variables: [variable('orphan')],
  });

  it('turns findings into diagnostics with profile severity and stable codes', () => {
    const codes = checkBot(messy, defaultProfile).map((d) => `${d.code}:${d.severity}`);
    expect(codes).toEqual([
      'QUAL-MISSING-ERROR-HANDLING:warning',
      'QUAL-DISABLED-CODE:info',
      'QUAL-UNUSED-VARIABLE:info',
    ]);
  });

  it('skips rules disabled in the profile and applies overridden severities', () => {
    const { profile } = resolveProfile([
      {
        name: 'client',
        source: 'k',
        data: {
          quality: {
            rules: {
              'disabled-code': { enabled: false, severity: 'info' },
              'missing-error-handling': { enabled: true, severity: 'error' },
            },
          },
        },
      },
    ]);
    const codes = checkBot(messy, profile).map((d) => `${d.code}:${d.severity}`);
    expect(codes).toEqual(['QUAL-MISSING-ERROR-HANDLING:error', 'QUAL-UNUSED-VARIABLE:info']);
  });

  it('only runs rules that apply to the requested side', () => {
    expect(checkBot(messy, defaultProfile, 'output').map((d) => d.code)).not.toContain(
      'QUAL-DISABLED-CODE',
    );
  });

  it('anchors diagnostics to the node and its source', () => {
    const d = checkBot(messy, defaultProfile).find((x) => x.code === 'QUAL-DISABLED-CODE');
    expect(d?.nodeId).toBe(messy.body[1]?.id);
    expect(d?.source).toEqual(messy.source);
    expect(d?.messageId).toBe('quality.disabled-code');
  });
});

describe('rule catalog', () => {
  it('keeps platform-specific rules as pending slots until samples arrive', () => {
    expect(pendingRules().sort()).toEqual([
      'fixed-delay',
      'hardcoded-email',
      'hardcoded-path',
      'hardcoded-url',
    ]);
  });

  it('registers every implemented rule under its own id', () => {
    for (const [id, entry] of Object.entries(ruleCatalog)) {
      if (entry.status === 'implemented') expect(entry.rule.id).toBe(id);
    }
  });
});
