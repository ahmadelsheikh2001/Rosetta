/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'repo',
        'docs',
        'adr',
        'corpus',
        'ir',
        'expr',
        'source-a360',
        'mappings',
        'standards',
        'assessment',
        'report',
        'cli',
        'design-tokens',
        'target-wal',
        'source-wal',
        'target-a360',
      ],
    ],
  },
};
