/**
 * IBM RPA WAL syntax used by the generator. Sources, in order of strength:
 * 1. Studio 30.0.2 round 1 (corpus/ibm/probe-30.0.2/round-1): verified.
 * 2. IBM RPA 30.0.x command reference (docs/formats/wal-30.0.2.md): documented, to confirm in Studio.
 * Every generated line that relies on (2) is listed in the bot's notes (ADR-017, ADR-019).
 */

const BACKSLASH = String.fromCharCode(92);

/** Line ending of generated files (W-02). */
export const EOL = '\r\n';

/** Comment prefix. Verified, round 1 (W-15). */
export const COMMENT = '// ';

/** A360 list index 0 becomes this in WAL (W-04, A-19: unverified). */
export const LIST_INDEX_BASE = 1;

/** `${name}` variable reference. Verified, round 1. */
export const ref = (name: string): string => `\${${name}}`;

/** IR type kind → `defVar --type`. String/Numeric/Boolean/DataTable verified; others documented. */
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

/** Conditional operators (documented: `loopWhile` operator options). */
export const walOperators: Readonly<Record<string, string>> = {
  eq: 'Equal_To',
  gt: 'Greater_Than',
  lt: 'Less_Than',
  ge: 'Greater_Than_Equal_To',
  le: 'Less_Than_Equal_To',
};

/** Error environment variables (documented: "Environment variables", 30.0.x). */
export const errorMessageRef = '${rpa:errorMessage}';
export const errorLineRef = '${rpa:errorLineNumber}';

/**
 * A360 system variables with a WAL equivalent. `init` lines run once at the
 * start of the script to fill a helper variable (documented: Get Environment Variable).
 */
export const systemValues: Readonly<
  Record<string, { readonly ref: string; readonly init?: readonly string[] }>
> = {
  'a360:AATaskName': { ref: '${rpa:scriptName}' },
  'a360:Machine': {
    ref: '${rosettaMachineName}',
    init: [
      'defVar --name rosettaMachineName --type String',
      'getEnvVar --name COMPUTERNAME --target "Process" rosettaMachineName=value',
    ],
  },
};

/** Boolean literal spelling. Verified, round 1 (`--value True`). */
export const walBoolean = (b: boolean): string => (b ? 'True' : 'False');

/**
 * Quotes a value. Backslash is an escape character in WAL strings (verified, round 1:
 * `"C:\RosettaTest\log.txt"` was shown as `C:RosettaTestlog.txt`), so it is doubled.
 * Escaping a double quote with a backslash is documented (IBM examples use `\"`).
 */
export const quote = (text: string): string =>
  `"${text
    .replaceAll(BACKSLASH, BACKSLASH + BACKSLASH)
    .replaceAll('"', BACKSLASH + '"')
    .replaceAll('\r', BACKSLASH + 'r')
    .replaceAll('\n', BACKSLASH + 'n')}"`;

/** Escapes text so it matches literally inside a .NET regular expression. */
export const regexLiteral = (text: string): string =>
  text.replace(/[\\^$.|?*+()[\]{}]/g, (c) => BACKSLASH + c);
