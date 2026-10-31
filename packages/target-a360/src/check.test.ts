import { describe, expect, it } from 'vitest';
import { checkA360 } from './check.js';
import { packageVersions } from './generate.js';

const pkg = (name: string, version = packageVersions[name]) => ({
  name,
  version,
  settingsAttributes: [],
});
const assign = (expression: string) => ({
  uid: 'u',
  commandName: 'assign',
  packageName: 'String',
  attributes: [{ name: 'sourceString', value: { type: 'STRING', expression } }],
  returnTo: { type: 'VARIABLE', variableName: 'vOut' },
});
const vars = [
  { name: 'vOut', type: 'STRING' },
  { name: 'vDict', type: 'DICTIONARY' },
];
const messages = (bot: Record<string, unknown>) => checkA360(bot).map((p) => p.message);

/** Each case is what the A360 editor or compiler reported in the import test of 2026-10-31. */
describe('checkA360', () => {
  it('passes a clean bot', () => {
    expect(
      messages({ nodes: [assign('Hi $vOut$')], variables: vars, packages: [pkg('String')] }),
    ).toEqual([]);
  });

  it('reports undeclared variables ("Variable not found", 02 line 24)', () => {
    expect(
      messages({
        nodes: [assign('$rosettaEntry1{Key}$')],
        variables: vars,
        packages: [pkg('String')],
      }),
    ).toEqual(['Variable "rosettaEntry1" is not declared ("Variable not found").']);
  });

  it('reports a list iterator over a dictionary ("Variable not allowed", 02 line 23)', () => {
    const loop = {
      commandName: 'loop.commands.start',
      packageName: 'Loop',
      attributes: [
        {
          name: 'iterator',
          returnTo: { type: 'VARIABLE', variableName: 'vOut' },
          attributes: [{ name: 'list', value: { type: 'VARIABLE', variableName: 'vDict' } }],
          value: { type: 'ITERATOR', iteratorName: 'list.iterators.list', packageName: 'List' },
        },
      ],
    };
    expect(
      messages({ nodes: [loop], variables: vars, packages: [pkg('Loop'), pkg('List')] }),
    ).toEqual([
      'list.iterators.list needs a LIST variable, got DICTIONARY ("Variable not allowed").',
    ]);
  });

  it('reports $System:…$ without the System package (03 line 15, deployment.compilation.failed)', () => {
    expect(
      messages({ nodes: [assign('$System:Date$')], variables: vars, packages: [pkg('String')] }),
    ).toEqual(["$System:Date$ needs the System package in the bot's packages."]);
  });

  it('reports a package version the Control Room does not have ("Package not found")', () => {
    expect(
      messages({ nodes: [assign('x')], variables: vars, packages: [pkg('String', '0.0.1')] }),
    ).toEqual([
      'Package String 0.0.1 is not one this Control Room is known to have ("Package not found").',
    ]);
  });
});
