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

export const FONTS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
};
export const RADII: Record<string, string> = { none: '0px', soft: '10px', round: '22px' };
