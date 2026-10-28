import type { Status } from '@rosetta/design-tokens';

/**
 * Status icons (ADR-018: status is never colour alone). Simple 16px strokes
 * drawn in `currentColor`; they are UI glyphs, not brand artwork.
 */
const paths: Record<Status, string> = {
  auto: '<path d="M3.5 8.5l3 3 6-7"/>',
  review:
    '<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  blocked: '<circle cx="8" cy="8" r="6"/><path d="M3.8 12.2l8.4-8.4"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.2v4"/><path d="M8 4.8v.1"/>',
};

/** Inline SVG icon for a status; decorative, the text label carries the meaning. */
export function icon(status: Status): string {
  return `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[status]}</svg>`;
}
