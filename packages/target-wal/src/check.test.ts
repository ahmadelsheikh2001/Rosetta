import { describe, expect, it } from 'vitest';
import { checkWal, parseLine } from './check.js';

const messages = (text: string) => checkWal(text).map((p) => `${p.line}: ${p.message}`);

describe('parseLine', () => {
  it('splits verb, quoted and bare values, flags and outputs', () => {
    const p = parseLine(
      'replaceText --texttoparse "a \\"b\\" c" --useregex --pattern "x" out=value',
    );
    expect(p?.verb).toBe('replaceText');
    expect(p?.params.get('texttoparse')).toBe('"a \\"b\\" c"');
    expect(p?.params.get('useregex')).toBe(true);
    expect(p?.outputs).toEqual(['out=value']);
  });

  it('rejects an unterminated string', () => {
    expect(parseLine('setVar --name "x --value 1')).toBeUndefined();
  });
});

describe('checkWal', () => {
  it('accepts a correct script', () => {
    const ok = [
      '// comment',
      'defVar --name n --type Numeric',
      'defVar --name f --type Boolean',
      'setVar --name "${f}" --value False',
      'goSub --label Try1',
      'beginSub --name Try1',
      'onError --label Catch1',
      'if --left "${n}" --operator "Greater_Than" --right 5',
      'return',
      'endIf',
      'endSub',
      'beginSub --name Catch1',
      'recover',
      'endSub',
    ].join('\r\n');
    expect(checkWal(ok)).toEqual([]);
  });

  it('reports what Studio reported in rounds 1-4', () => {
    expect(
      messages(
        [
          'defVar --name a --type String',
          'tryCatch',
          'readCSV --filepath "x"',
          'strDictAdd --key k --value v --dictionary ${d}',
          'defVar --name late --type String',
          'convertNumberToText --number 1 --conversiontype "Number" --decimals 0 a=value',
          'messageBox --title "t" --text "${list[1]}" --icon "Information"',
        ].join('\n'),
      ),
    ).toEqual([
      '2: Unknown command "tryCatch" (not in the catalog of verified/documented commands).',
      '3: readCSV requires --delimiter.',
      '5: Variable definitions must be at the top of the script (round 2).',
      '6: convertNumberToText --conversiontype "Number" is not one of: SimpleNumber, ExtendedNumber, SimpleMoney, ExtendedMoney, SimplePercentage, ExtendedPercentage.',
      '7: List or dictionary access inside a value is not interpolated (round 4); use get / strDictGet.',
    ]);
  });

  it('reports setVar on SecureString variables, as Studio did in round 8', () => {
    const text = [
      'defVar --name a --type SecureString',
      'defVar --name b --type SecureString',
      'setVar --name "${b}" --value "${a}"',
    ].join('\r\n');
    expect(messages(text)).toEqual([
      '3: setVar does not accept the SecureString variable b (round 8).',
      '3: setVar does not accept the SecureString variable a (round 8).',
    ]);
  });

  it('reports anything between subroutine blocks (round 3)', () => {
    expect(
      messages(
        'beginSub --name A\r\nendSub\r\nsetVar --name "${x}" --value 1\r\nbeginSub --name B\r\nendSub',
      ),
    ).toEqual(['3: Only subroutine blocks may follow the first beginSub (round 3).']);
  });

  it('reports unbalanced blocks and undefined subroutines', () => {
    expect(
      messages(
        'if --left "a" --operator "Is_True"\nfor --variable ${i} --from 1 --to 2 --step 1\nendIf\ngoSub --label Missing',
      ),
    ).toEqual([
      '1: if is never closed (endIf).',
      '3: endIf does not close an open for.',
      '4: Subroutine "Missing" is not defined.',
    ]);
  });

  it('warns about parameters the catalog does not know', () => {
    expect(checkWal('getStringLength --text "a" --bogus 1 n=value')).toEqual([
      {
        line: 1,
        severity: 'warning',
        message: 'Parameter --bogus is not known for getStringLength.',
      },
    ]);
  });
});
