import type {
  BinaryOp,
  Block,
  Bot,
  CatchClause,
  Expr,
  JsonValue,
  LoopSpec,
  OpName,
  SourceRef,
  Statement,
  Variable,
} from '@rosetta/ir';
import { LiftCode, type LiftContext } from './context.js';
import type { SourceAttribute, SourceBot, SourceNode } from './schema.js';
import { valueToExpr, variableType, varRefOf } from './values.js';

/** Comparison operator codes seen in corpus 02 and 04. Others are reported, not guessed. */
const operators: Readonly<Record<string, BinaryOp>> = { EQ: 'eq', GT: 'gt', LT: 'lt' };

const attr = (node: { attributes?: SourceAttribute[] | undefined }, name: string) =>
  node.attributes?.find((a) => a.name === name);

const stringAttr = (node: { attributes?: SourceAttribute[] | undefined }, name: string) =>
  attr(node, name)?.value?.string;

const raw = (node: unknown): JsonValue => JSON.parse(JSON.stringify(node)) as JsonValue;

/** Lifts one A360 bot (Source Model) to IR. Problems are collected on `ctx`. */
export function liftBot(source: SourceBot, name: string, ctx: LiftContext): Bot {
  for (const v of source.variables) ctx.variablesByLowerName.set(v.name.toLowerCase(), v.name);
  const variables: Variable[] = source.variables.map((v) => {
    const type = variableType(v, ctx);
    return {
      name: v.name,
      type,
      direction: v.input && v.output ? 'inout' : v.input ? 'input' : v.output ? 'output' : 'local',
      sensitive: type.kind === 'credential',
      ...(v.description ? { description: v.description } : {}),
      ...(v.defaultValue ? { defaultValue: valueToExpr(v.defaultValue, ctx) } : {}),
    };
  });

  return {
    id: ctx.file,
    name,
    source: ctx.ref([]),
    variables,
    packages: (source.packages ?? []).map((p) => ({ name: p.name, version: p.version })),
    body: liftBlock(source.nodes, [], ctx),
  };
}

function liftBlock(nodes: readonly SourceNode[], path: readonly number[], ctx: LiftContext): Block {
  return nodes.map((n, i) => liftNode(n, [...path, i], ctx));
}

/** Branch nodes are addressed after the children: index = children.length + branch index. */
const branchPath = (node: SourceNode, path: readonly number[], i: number) => [
  ...path,
  (node.children?.length ?? 0) + i,
];

function liftNode(node: SourceNode, path: readonly number[], ctx: LiftContext): Statement {
  const label = `${node.packageName}/${node.commandName}`;
  const base = {
    id: node.uid,
    source: ctx.ref(path, node.uid, label),
    ...(node.disabled ? { disabled: true } : {}),
  };
  const children = () => liftBlock(node.children ?? [], path, ctx);

  switch (label) {
    case 'Step/step':
      return {
        ...base,
        source: ctx.ref(path, node.uid, stringAttr(node, 'title') ?? label),
        kind: 'group',
        label: stringAttr(node, 'title') ?? '',
        body: children(),
      };
    case 'Comment/Comment':
      return { ...base, kind: 'comment', text: stringAttr(node, 'comment') ?? '' };
    case 'If/if':
      return liftIf(node, path, base, ctx);
    case 'Loop/loop.commands.start':
      return liftLoop(node, path, base, ctx);
    case 'Loop/loop.commands.break':
    case 'Loop/loop.commands.continue': {
      const target = stringAttr(node, 'anchor');
      return {
        ...base,
        kind: label.endsWith('break') ? 'break' : 'continue',
        ...(target ? { target } : {}),
      };
    }
    case 'ErrorHandler/try':
      return liftTry(node, path, base, ctx);
    case 'ErrorHandler/throw': {
      const message = attr(node, 'message')?.value;
      return {
        ...base,
        kind: 'throw',
        message: message ? valueToExpr(message, ctx, base.source) : { kind: 'literal', value: '' },
        category: 'system',
      };
    }
    default:
      return liftAction(node, path, base, ctx);
  }
}

interface Base {
  id: string;
  source: SourceRef;
  disabled?: boolean;
}

function liftCondition(
  holder: { attributes?: SourceAttribute[] | undefined },
  at: SourceRef,
  ctx: LiftContext,
): Expr {
  const condition = attr(holder, 'condition');
  const name = condition?.value?.conditionalName ?? '';
  const left = attr(condition ?? {}, 'variable')?.value;
  const right = attr(condition ?? {}, 'value')?.value;
  const code = stringAttr(condition ?? {}, 'operator') ?? '';
  const op = operators[code];
  const known = ['stringVariable', 'numberVariable', 'booleanVariable'].includes(name);

  if (!condition || !known || !op || !left || !right) {
    ctx.report(
      LiftCode.Condition,
      'warning',
      { condition: name || 'none', operator: code || 'none' },
      at,
    );
    return {
      kind: 'raw',
      text: JSON.stringify(condition ?? null),
      dialect: 'a360',
      reason: `condition ${name}`,
    };
  }
  if (name === 'stringVariable') {
    const matchCase = attr(condition, 'matchCase')?.value?.boolean;
    const ignoreCr = attr(condition, 'isIgnoreCarriage')?.value?.boolean;
    if (matchCase !== true || ignoreCr === true) {
      ctx.report(
        LiftCode.Semantic,
        'info',
        { option: `matchCase=${String(matchCase)}, isIgnoreCarriage=${String(ignoreCr)}` },
        at,
      );
    }
  }
  return {
    kind: 'binary',
    op,
    left: valueToExpr(left, ctx, at),
    right: valueToExpr(right, ctx, at),
  };
}

function liftIf(
  node: SourceNode,
  path: readonly number[],
  base: Base,
  ctx: LiftContext,
): Statement {
  const branches = [
    {
      condition: liftCondition(node, base.source, ctx),
      body: liftBlock(node.children ?? [], path, ctx),
    },
  ];
  let elseBody: Block | undefined;
  (node.branches ?? []).forEach((b, i) => {
    const bPath = branchPath(node, path, i);
    const body = liftBlock(b.children ?? [], bPath, ctx);
    if (b.commandName === 'elseIf') {
      branches.push({ condition: liftCondition(b, ctx.ref(bPath, b.uid, 'If/elseIf'), ctx), body });
    } else if (b.commandName === 'else') {
      elseBody = body;
    } else {
      ctx.report(
        LiftCode.Structure,
        'warning',
        { node: `${b.packageName}/${b.commandName}`, parent: 'If/if' },
        ctx.ref(bPath, b.uid),
      );
    }
  });
  return { ...base, kind: 'if', branches, ...(elseBody ? { else: elseBody } : {}) };
}

function liftLoop(
  node: SourceNode,
  path: readonly number[],
  base: Base,
  ctx: LiftContext,
): Statement {
  const body = liftBlock(node.children ?? [], path, ctx);
  const label = node.anchor?.string;
  const loopType = stringAttr(node, 'loopType');
  let spec: LoopSpec | undefined;

  if (loopType === 'WHILE') {
    const checkAtEnd = attr(node, 'checkConditionAtEnd')?.value?.boolean === true;
    spec = {
      kind: 'while',
      condition: liftCondition(node, base.source, ctx),
      ...(checkAtEnd ? { checkAtEnd } : {}),
    };
  } else if (loopType === 'ITERATOR') {
    const iterator = attr(node, 'iterator');
    const item = varRefOf(iterator?.returnTo);
    const arg = (name: string) => {
      const v = attr(iterator ?? {}, name)?.value;
      return v ? valueToExpr(v, ctx, base.source) : undefined;
    };
    const kind = iterator?.value?.iteratorName;
    const count = arg('times');
    const list = arg('list');
    const map = arg('sourceMap');
    const folder = arg('folderPath');
    if (kind === 'loop.iterators.times' && count) {
      spec = { kind: 'times', count, ...(item ? { indexVar: item } : {}) };
    } else if (kind === 'list.iterators.list' && list && item) {
      const forOptions = stringAttr(iterator ?? {}, 'forOptions');
      if (forOptions !== undefined && forOptions !== 'all') {
        ctx.report(LiftCode.Semantic, 'info', { option: `forOptions=${forOptions}` }, base.source);
      }
      spec = { kind: 'forEach', collection: 'list', source: list, itemVar: item };
    } else if (kind === 'dictionary.iterators.keys' && map && item) {
      spec = { kind: 'forEach', collection: 'dictKeys', source: map, itemVar: item };
    } else if (kind === 'loop.iterators.files' && folder && item) {
      spec = { kind: 'forEach', collection: 'file', source: folder, itemVar: item };
    } else {
      ctx.report(LiftCode.Iterator, 'warning', { iterator: kind ?? 'none' }, base.source);
    }
  }

  if (!spec) {
    if (loopType !== 'ITERATOR')
      ctx.report(LiftCode.Iterator, 'warning', { iterator: loopType ?? 'none' }, base.source);
    return {
      ...base,
      kind: 'unknown',
      raw: raw({ ...node, children: undefined }),
      reason: 'loop type not understood',
      body,
    };
  }
  return { ...base, kind: 'loop', loop: spec, body, ...(label ? { label } : {}) };
}

function liftTry(
  node: SourceNode,
  path: readonly number[],
  base: Base,
  ctx: LiftContext,
): Statement {
  const catches: CatchClause[] = [];
  let finallyBody: Block | undefined;
  (node.branches ?? []).forEach((b, i) => {
    const bPath = branchPath(node, path, i);
    const body = liftBlock(b.children ?? [], bPath, ctx);
    if (b.commandName === 'catch') {
      const errorVar = varRefOf(b.returns?.errorMessage);
      const lineVar = varRefOf(b.returns?.errorLineNumber);
      const errorType = attr(b, 'exceptionType')?.value?.exceptionName;
      if (attr(b, 'continueOnError')?.value?.boolean === true) {
        ctx.report(
          LiftCode.Semantic,
          'info',
          { option: 'continueOnError=true' },
          ctx.ref(bPath, b.uid, 'ErrorHandler/catch'),
        );
      }
      catches.push({
        body,
        ...(errorVar ? { errorVar } : {}),
        ...(lineVar ? { lineVar } : {}),
        ...(errorType ? { errorType } : {}),
      });
    } else if (b.commandName === 'finally') {
      finallyBody = body;
    } else {
      ctx.report(
        LiftCode.Structure,
        'warning',
        { node: `${b.packageName}/${b.commandName}`, parent: 'ErrorHandler/try' },
        ctx.ref(bPath, b.uid),
      );
    }
  });
  return {
    ...base,
    kind: 'try',
    body: liftBlock(node.children ?? [], path, ctx),
    catches,
    ...(finallyBody ? { finally: finallyBody } : {}),
  };
}

function liftAction(
  node: SourceNode,
  path: readonly number[],
  base: Base,
  ctx: LiftContext,
): Statement {
  if (node.children?.length || node.branches?.length) {
    ctx.report(
      LiftCode.Structure,
      'warning',
      { node: `${node.packageName}/${node.commandName}`, parent: 'action' },
      base.source,
    );
    return {
      ...base,
      kind: 'unknown',
      raw: raw({ ...node, children: undefined, branches: undefined }),
      reason: 'command with nested blocks not understood',
      body: liftBlock(node.children ?? [], path, ctx),
    };
  }

  const args: Record<string, Expr> = {};
  const addArgs = (attrs: readonly SourceAttribute[], prefix: string) => {
    for (const a of attrs) {
      const key = prefix + a.name;
      if (a.value) args[key] = valueToExpr(a.value, ctx, base.source);
      if (a.attributes) addArgs(a.attributes, `${key}.`);
    }
  };
  addArgs(node.attributes ?? [], '');

  const outputs: Record<string, Extract<Expr, { kind: 'var' }>> = {};
  const result = varRefOf(node.returnTo);
  if (result) outputs.result = result;
  for (const [key, value] of Object.entries(node.returns ?? {})) {
    const ref = varRefOf(value);
    if (ref) outputs[key] = ref;
  }

  const mapping = ctx.lookup(node.packageName, node.commandName);
  const op = (mapping?.irOp ?? `vendor:a360/${node.packageName}/${node.commandName}`) as OpName;
  return {
    ...base,
    kind: 'action',
    op,
    args,
    outputs,
    ...(mapping ? { mappingId: mapping.id } : {}),
  };
}
