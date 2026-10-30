import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/**', '**/coverage/**', 'corpus/**']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', '*.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` is only allowed at validated boundaries, with an inline disable + reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Browser code of the web UI (rosetta serve)
    files: ['packages/cli/web/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  prettier,
);
