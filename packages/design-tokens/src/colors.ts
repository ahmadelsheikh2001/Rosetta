/**
 * RPA Rosetta palettes. Exact HEX values; change them only together with
 * ADR-018 and the token test.
 */
export const primary = {
  blackBlue: '#02021E',
  oxfordBlue: '#001944',
  charcoal: '#2B3E51',
  biceBlue: '#0071B4',
  dodgerBlue: '#0094F7',
  antiFlashWhite: '#EBEFF0',
} as const;

/** Only for differentiation in content-heavy views, never as main colours. */
export const secondary = {
  smokyBlack: '#110C01',
  cafeNoir: '#442B00',
  darkCafe: '#513E2B',
  rust: '#B44300',
  spanishOrange: '#F76300',
  isabelline: '#F0ECEB',
} as const;

/** White is allowed for page and card backgrounds (B-03). */
export const neutral = {
  white: '#FFFFFF',
} as const;

export type PrimaryColor = keyof typeof primary;
export type SecondaryColor = keyof typeof secondary;
export type NeutralColor = keyof typeof neutral;
export type BrandColor = PrimaryColor | SecondaryColor | NeutralColor;

export const palette: Readonly<Record<BrandColor, string>> = {
  ...primary,
  ...secondary,
  ...neutral,
};

const HEX = /^#[0-9A-F]{6}$/;

/**
 * Returns a tint of a brand colour: the colour mixed toward white.
 * @param amount 0 returns the colour itself, 1 returns white.
 */
export function tint(color: BrandColor, amount: number): string {
  if (!(amount >= 0 && amount <= 1)) {
    throw new RangeError(`tint amount must be within [0, 1], got ${amount}`);
  }
  const hex = palette[color];
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) => Math.round(c + (255 - c) * amount))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** True when `value` is a 6-digit upper-case HEX colour. */
export function isHex(value: string): boolean {
  return HEX.test(value);
}
