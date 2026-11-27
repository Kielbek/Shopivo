const MONEY = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });

export function money(minor: number | null | undefined, currency = 'PLN'): string {
  if (minor === null || minor === undefined) return '';
  const f = currency === 'PLN' ? MONEY : new Intl.NumberFormat('pl-PL', { style: 'currency', currency });
  return f.format(minor / 100);
}

/** Text colour (#111 or #fff) with the better contrast on a background colour (WCAG relative luminance). */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#111111';
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number] : null;
}

function luminance(c: [number, number, number]): number {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #RRGGBB colours (1 when either is invalid). */
export function contrast(a: string, b: string): number {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return 1;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * The colour, darkened (on light backgrounds) or lightened (on dark ones) in small steps until text in it keeps 4.5:1
 * contrast — e.g. a golden accent becomes a readable amber for prices and small labels on white.
 */
export function readableTint(color: string, background: string): string {
  const c = rgb(color);
  const bg = rgb(background);
  if (!c || !bg) return color;
  const target = luminance(bg) > 0.4 ? 0 : 255;
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const mixed = c.map((v) => Math.round(v + (target - v) * k)) as [number, number, number];
    const hex = '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
    if (contrast(hex, background) >= 4.5) return hex;
  }
  return target ? '#ffffff' : '#111111';
}

export const FONTS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  editorial: '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  playful: '"Nunito Sans", ui-rounded, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
};
/** Heading font per font choice (only "editorial" pairs a display serif with a sans body). Fonts are self-hosted. */
export const DISPLAY_FONTS: Record<string, string> = {
  editorial: '"Cormorant Garamond", ui-serif, Georgia, "Times New Roman", serif',
  playful: '"Baloo 2", ui-rounded, "Nunito Sans", system-ui, sans-serif',
};
export const RADII: Record<string, string> = { none: '0px', soft: '10px', round: '22px' };
