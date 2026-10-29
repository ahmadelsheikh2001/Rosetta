import type { Diagnostic, Severity, SourceRef } from '@rosetta/ir';

/** Registry lookup injected by the caller, so this layer never imports `mappings` (ADR-002). */
export type MappingLookup = (
  packageName: string,
  commandName: string,
) => { readonly id: string; readonly irOp?: string } | undefined;

/** Lifting problems, one code per kind. Messages live in the report catalog (`lift.*`). */
export const LiftCode = {
  Json: 'A360-JSON',
  Schema: 'A360-SCHEMA',
  UnknownValue: 'A360-UNKNOWN-VALUE',
  RawExpression: 'A360-RAW-EXPRESSION',
  Condition: 'A360-CONDITION',
  Iterator: 'A360-ITERATOR',
  Semantic: 'A360-SEMANTIC',
  VariableType: 'A360-VARIABLE-TYPE',
  Structure: 'A360-STRUCTURE',
  Zip: 'A360-ZIP',
} as const;
export type LiftCode = (typeof LiftCode)[keyof typeof LiftCode];

/** Report catalog key of each lift code. */
export const liftMessageIds: Readonly<Record<LiftCode, string>> = {
  'A360-JSON': 'lift.json',
  'A360-SCHEMA': 'lift.schema',
  'A360-UNKNOWN-VALUE': 'lift.unknownValue',
  'A360-RAW-EXPRESSION': 'lift.rawExpression',
  'A360-CONDITION': 'lift.condition',
  'A360-ITERATOR': 'lift.iterator',
  'A360-SEMANTIC': 'lift.semantic',
  'A360-VARIABLE-TYPE': 'lift.variableType',
  'A360-STRUCTURE': 'lift.structure',
  'A360-ZIP': 'lift.zip',
};

/** Collects diagnostics while lifting one bot file. */
export class LiftContext {
  readonly diagnostics: Diagnostic[] = [];
  /** Declared variable names by lower-case name; `VARIABLEMAP` stores names lower-cased (corpus 01, A-18). */
  readonly variablesByLowerName = new Map<string, string>();

  constructor(
    readonly file: string,
    readonly lookup: MappingLookup,
  ) {}

  ref(nodePath: readonly number[], nodeId?: string, label?: string): SourceRef {
    return {
      platform: 'a360',
      file: this.file,
      nodePath,
      ...(nodeId === undefined ? {} : { nodeId }),
      ...(label === undefined ? {} : { label }),
    };
  }

  report(
    code: LiftCode,
    severity: Severity,
    params: Record<string, string | number>,
    source?: SourceRef,
  ): void {
    const category =
      code === LiftCode.Semantic
        ? 'semantic-difference'
        : code === LiftCode.Json || code === LiftCode.Schema || code === LiftCode.Zip
          ? 'parse'
          : 'unmapped';
    this.diagnostics.push({
      code,
      severity,
      category,
      messageId: liftMessageIds[code],
      params,
      ...(source ? { source, ...(source.nodeId ? { nodeId: source.nodeId } : {}) } : {}),
    });
  }
}
