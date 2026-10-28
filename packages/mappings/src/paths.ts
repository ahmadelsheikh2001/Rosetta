import { fileURLToPath } from 'node:url';

/** Package root, resolved from both `src/` (tests) and `dist/` (runtime). */
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

/** Directory holding the YAML registry entries. */
export const registryDir = `${packageRoot}registry`;

/** Directory holding one test fixture per tested entry: `<id>.yaml`. */
export const fixturesDir = `${packageRoot}fixtures`;

/** Directory holding TS handlers; each needs a sibling `*.test.ts`. */
export const handlersDir = `${packageRoot}src/handlers`;
