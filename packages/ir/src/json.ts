/** Any JSON-serialisable value. Used to keep raw source fragments verbatim. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
