const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML content and attribute values. */
export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => entities[c] ?? c);
}

/** Turns arbitrary text into a safe, stable HTML id. */
export function anchor(prefix: string, value: string): string {
  return `${prefix}-${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}
