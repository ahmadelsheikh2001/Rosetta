/**
 * IBM RPA WAL syntax used by the generator: a DRAFT written from general
 * knowledge, not yet verified against Studio 30.0.2 (ADR-017). Every decision
 * names the assumption it depends on; each generated line that uses one is
 * listed in the bot's notes so it can be checked in Studio and fixed here.
 */

/** Line ending of generated files (W-02). */
export const EOL = '\r\n';

/** Comment prefix (W-15). */
export const COMMENT = '// ';

/** A360 list index 0 becomes this in WAL (W-04, A-19). */
export const LIST_INDEX_BASE = 1;

/** `${name}` variable reference inside values (W-04). */
export const ref = (name: string): string => `\${${name}}`;

/** IR type kind → WAL `defVar --type` (W-03). */
export const walTypes: Readonly<Record<string, string>> = {
  string: 'String',
  number: 'Numeric',
  boolean: 'Boolean',
  datetime: 'DateTime',
  list: 'List',
  dict: 'StringDictionary',
  table: 'DataTable',
  credential: 'SecureString',
};

/** Comparison operator names (W-05). */
export const walOperators: Readonly<Record<string, string>> = {
  eq: 'Equal_To',
  gt: 'Greater_Than',
  lt: 'Less_Than',
};

/** System values available as WAL expressions (W-08). */
export const errorMessageRef = '${wdg:error.Message}';
export const errorLineRef = '${wdg:error.LineNumber}';

/** Boolean literal spelling (W-03). */
export const walBoolean = (b: boolean): string => (b ? 'True' : 'False');

/** Quotes a value; inner double quotes are backslash-escaped (W-04, unverified). */
export const quote = (text: string): string => `"${text.replace(/"/g, '\\"')}"`;
