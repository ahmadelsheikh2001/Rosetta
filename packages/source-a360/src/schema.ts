import { z } from 'zod';

/**
 * Source Model of an A360 task bot file (ADR-002), as verified on corpus 01–04
 * (docs/formats/a360-bot-json.md). Objects are "loose": keys we have not seen
 * yet are kept rather than rejected, because A360 evolves with its packages.
 */

/** `{ type, <payload> }`. Payload keys vary by `type`; all are optional here. */
export const sourceValue = z.looseObject({
  type: z.string(),
  string: z.string().optional(),
  expression: z.string().optional(),
  /** Numbers are stored as strings: `"5"`, `"-1"`. */
  number: z.string().optional(),
  boolean: z.boolean().optional(),
  variableName: z.string().optional(),
  variableMapNames: z.array(z.string()).optional(),
  conditionalName: z.string().optional(),
  iteratorName: z.string().optional(),
  exceptionName: z.string().optional(),
  packageName: z.string().optional(),
  get list() {
    return z.array(sourceValue).optional();
  },
  get dictionary() {
    return z
      .array(
        z.looseObject({ key: z.string(), value: sourceValue, entryType: z.string().optional() }),
      )
      .optional();
  },
  table: z.unknown().optional(),
});
export type SourceValue = z.infer<typeof sourceValue>;

/** `{ name, value }`; conditions and iterators nest further attributes. */
export const sourceAttribute = z.looseObject({
  name: z.string(),
  value: sourceValue.optional(),
  returnTo: sourceValue.optional(),
  get attributes() {
    return z.array(sourceAttribute).optional();
  },
});
export type SourceAttribute = z.infer<typeof sourceAttribute>;

export const sourceNode = z.looseObject({
  uid: z.string(),
  commandName: z.string(),
  packageName: z.string(),
  disabled: z.boolean().optional(),
  attributes: z.array(sourceAttribute).optional(),
  returnTo: sourceValue.optional(),
  returns: z.record(z.string(), sourceValue).optional(),
  anchor: sourceValue.optional(),
  get children() {
    return z.array(sourceNode).optional();
  },
  get branches() {
    return z.array(sourceNode).optional();
  },
});
export type SourceNode = z.infer<typeof sourceNode>;

export const sourceVariable = z.looseObject({
  name: z.string(),
  type: z.string(),
  subtype: z.string().optional(),
  description: z.string().optional(),
  readOnly: z.boolean().optional(),
  input: z.boolean().optional(),
  output: z.boolean().optional(),
  defaultValue: sourceValue.optional(),
});
export type SourceVariable = z.infer<typeof sourceVariable>;

export const sourcePackage = z.looseObject({ name: z.string(), version: z.string() });

export const sourceBot = z.looseObject({
  triggers: z.array(z.unknown()).optional(),
  nodes: z.array(sourceNode),
  variables: z.array(sourceVariable),
  packages: z.array(sourcePackage).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});
export type SourceBot = z.infer<typeof sourceBot>;
