import {
  action,
  bot,
  comment,
  group,
  ifThen,
  lit,
  loopTimes,
  ref,
  resetIds,
  tryCatch,
  variable,
  type Block,
  type Project,
  type SourceRef,
  type Statement,
} from '@rosetta/ir';
import type { MappingEntry } from '@rosetta/mappings';

/**
 * Hand-built SYNTHETIC portfolio for previewing the report design before real
 * samples exist. Package and command names are invented on purpose (ADR-017):
 * nothing here describes the real A360 format.
 */

const entry = (id: string, status: MappingEntry['status'], irOp?: string): MappingEntry => ({
  id: `synthetic.${id}`,
  source: { platform: 'a360', package: 'SyntheticPackage', command: id },
  status,
  ...(irOp ? { irOp } : {}),
  evidence: [],
});

/** Registry used with {@link syntheticProject}. */
export const syntheticRegistry: readonly MappingEntry[] = [
  entry('assign', 'mapped', 'variable.assign'),
  entry('log', 'mapped', 'log.write'),
  entry('message', 'mapped', 'dialog.message'),
  entry('file-copy', 'mapped', 'file.copy'),
  entry('string-replace', 'mapped', 'string.replace'),
  entry('sheet-open', 'partial', 'excel.open'),
  entry('sheet-read', 'partial', 'excel.readRange'),
  entry('web-click', 'partial', 'browser.click'),
  entry('mail-send', 'planned'),
  entry('terminal-send', 'unsupported'),
];

let path = 0;
const at = (file: string, label: string): { source: SourceRef } => ({
  source: { platform: 'a360', file, nodePath: [path++ % 7, path % 3], label },
});

const step = (file: string, id: string, label: string) =>
  action(
    (syntheticRegistry.find((e) => e.id === `synthetic.${id}`)?.irOp ??
      `vendor:a360/SyntheticPackage/${id}`) as `${string}.${string}`,
    { mappingId: `synthetic.${id}`, ...at(file, label) },
  );
const vendor = (file: string, name: string) =>
  action(`vendor:a360/SyntheticLegacy/${name}`, at(file, `SyntheticLegacy/${name}`));
const repeat = (n: number, make: () => Statement): Block => Array.from({ length: n }, make);
const ui = (file: string) =>
  action('browser.click', {
    mappingId: 'synthetic.web-click',
    target: { technology: 'web', strategies: [], raw: {} },
    ...at(file, 'Click (synthetic)'),
  });

function invoiceIntake(): ReturnType<typeof bot> {
  const f = 'Bots/Synthetic/InvoiceIntake';
  return bot(
    'Invoice intake',
    [
      comment('Reads the daily invoice sheet and files each invoice.'),
      group('Initialization', [step(f, 'assign', 'Assign'), step(f, 'sheet-open', 'Open sheet')]),
      group('Processing', [
        tryCatch(
          [
            loopTimes(10, [
              step(f, 'sheet-read', 'Read row'),
              ifThen(
                ref('isValid'),
                [step(f, 'file-copy', 'Copy invoice')],
                [step(f, 'log', 'Log')],
              ),
            ]),
          ],
          [{ errorVar: ref('err'), body: [step(f, 'log', 'Log error')] }],
        ),
      ]),
      group('End', [step(f, 'message', 'Message box')]),
    ],
    {
      description: 'Files daily invoices into the archive.',
      variables: [variable('isValid', { kind: 'boolean' }), variable('err')],
      packages: [
        { name: 'SyntheticPackage', version: '3.2.0' },
        { name: 'SyntheticSheets', version: '1.4.1' },
      ],
      source: { platform: 'a360', file: f, nodePath: [] },
    },
  );
}

function cardDisputes(): ReturnType<typeof bot> {
  const f = 'Bots/Synthetic/CardDisputes';
  const deep: Block = [
    ifThen(lit(true), [
      loopTimes(3, [
        ifThen(lit(true), [
          tryCatch(
            [ifThen(lit(true), [ifThen(lit(true), [vendor(f, 'legacyLookup')])])],
            [{ body: [] }],
          ),
        ]),
      ]),
    ]),
  ];
  return bot(
    'Card disputes',
    [
      ...repeat(4, () => ui(f)),
      ...deep,
      step(f, 'mail-send', 'Send email'),
      step(f, 'mail-send', 'Send email'),
      { ...step(f, 'log', 'Log'), disabled: true },
      {
        id: 'cd-call',
        kind: 'callBot',
        target: { path: 'Bots/Synthetic/Notify' },
        inputs: {},
        outputs: {},
        ...at(f, 'Run bot'),
      },
      {
        id: 'cd-unknown',
        kind: 'unknown',
        raw: { synthetic: true },
        reason: 'synthetic unknown node',
        ...at(f, 'Unknown'),
      },
    ],
    {
      description: 'Collects dispute details from the card portal.',
      variables: [variable('caseId'), variable('tempValue')],
      packages: [
        { name: 'SyntheticPackage', version: '3.2.0' },
        { name: 'SyntheticBrowser', version: '2.0.0' },
        { name: 'SyntheticLegacy', version: '0.9.0' },
      ],
      source: { platform: 'a360', file: f, nodePath: [] },
    },
  );
}

function coreLedgerSync(): ReturnType<typeof bot> {
  const f = 'Bots/Synthetic/CoreLedgerSync';
  return bot(
    'Core ledger sync',
    [
      ...repeat(12, () => step(f, 'terminal-send', 'Send keys')),
      ...repeat(30, () => vendor(f, 'screenScrape')),
      loopTimes(50, [step(f, 'string-replace', 'Replace'), step(f, 'terminal-send', 'Send keys')]),
      ...repeat(6, () => step(f, 'assign', 'Assign')),
    ],
    {
      description: 'Posts reconciled entries to the core ledger terminal.',
      variables: [variable('screenText'), variable('unusedCounter', { kind: 'number' })],
      packages: [
        { name: 'SyntheticPackage', version: '3.2.0' },
        { name: 'SyntheticTerminal', version: '5.1.0' },
        { name: 'SyntheticLegacy', version: '0.9.0' },
      ],
      source: { platform: 'a360', file: f, nodePath: [] },
    },
  );
}

function notify(): ReturnType<typeof bot> {
  const f = 'Bots/Synthetic/Notify';
  return bot(
    'Notify',
    [tryCatch([step(f, 'mail-send', 'Send email')], [{ body: [step(f, 'log', 'Log error')] }])],
    {
      description: 'Helper bot: sends a notification email.',
      variables: [variable('to', undefined, { direction: 'input' })],
      packages: [{ name: 'SyntheticPackage', version: '3.2.0' }],
      source: { platform: 'a360', file: f, nodePath: [] },
    },
  );
}

function statementExport(): ReturnType<typeof bot> {
  const f = 'Bots/Synthetic/StatementExport';
  return bot(
    'Statement export',
    [
      group('Processing', [
        tryCatch(
          [
            step(f, 'sheet-open', 'Open sheet'),
            ...repeat(5, () => step(f, 'sheet-read', 'Read range')),
            step(f, 'file-copy', 'Copy file'),
          ],
          [{ body: [step(f, 'log', 'Log error')] }],
          [step(f, 'log', 'Log end')],
        ),
      ]),
    ],
    {
      description: 'Exports monthly statements to the shared folder.',
      packages: [
        { name: 'SyntheticPackage', version: '3.1.0' },
        { name: 'SyntheticSheets', version: '1.4.1' },
      ],
      source: { platform: 'a360', file: f, nodePath: [] },
    },
  );
}

function loanOnboarding(): ReturnType<typeof bot> {
  const f = 'Bots/Synthetic/LoanOnboarding';
  return bot(
    'Loan onboarding',
    [
      comment('Creates the loan application from the intake form.'),
      group('Initialization', [step(f, 'assign', 'Assign'), step(f, 'assign', 'Assign')]),
      group('Processing', [
        tryCatch(
          [...repeat(6, () => ui(f)), ...repeat(18, () => vendor(f, 'formFill'))],
          [
            {
              errorVar: ref('err'),
              body: [step(f, 'log', 'Log error'), step(f, 'mail-send', 'Send email')],
            },
          ],
        ),
      ]),
    ],
    {
      description: 'Creates loan applications from the web intake form.',
      variables: [variable('err')],
      packages: [
        { name: 'SyntheticPackage', version: '3.2.0' },
        { name: 'SyntheticBrowser', version: '2.0.0' },
        { name: 'SyntheticLegacy', version: '0.9.0' },
      ],
      source: { platform: 'a360', file: f, nodePath: [] },
    },
  );
}

/** Six synthetic bots spanning sizes S to XL, clean to messy. */
export function syntheticProject(): Project {
  path = 0;
  resetIds();
  return {
    bots: [
      invoiceIntake(),
      cardDisputes(),
      loanOnboarding(),
      coreLedgerSync(),
      notify(),
      statementExport(),
    ],
    dependencies: [{ from: 'Card disputes', to: { kind: 'bot', botId: 'Notify' } }],
    diagnostics: [],
  };
}
