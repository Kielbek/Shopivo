import { StoreIndustry } from '@shopivo/shared-models';

/** Panel-side description of each template: who it suits and what makes it different (codes come from the API). */
export interface ThemeMeta {
  industries: StoreIndustry[];
  style: ThemeStyle;
  features: string[];
}

export type ThemeStyle = 'minimal' | 'elegant' | 'colorful' | 'technical' | 'natural';

export const STYLE_LABELS: Record<ThemeStyle, string> = {
  minimal: 'Minimalistyczny', elegant: 'Elegancki', colorful: 'Kolorowy', technical: 'Techniczny', natural: 'Naturalny',
};

export const THEME_META: Record<string, ThemeMeta> = {
  VERA: { industries: ['FASHION', 'FOOTWEAR', 'ACCESSORIES', 'JEWELRY'], style: 'elegant',
    features: ['Własne zdjęcia szablonu (do podmiany)', 'Kafelki działów i filtry produktów', 'Boczny koszyk z progiem darmowej dostawy'] },
  FASHION: { industries: ['FASHION', 'FOOTWEAR', 'ACCESSORIES', 'HANDMADE'], style: 'elegant', features: ['Duży baner ze zdjęciem', 'Szeryfowe nagłówki', 'Ostre krawędzie'] },
  BEAUTY: { industries: ['COSMETICS', 'PERFUMES', 'MEDICAL', 'ECO'], style: 'elegant', features: ['Pudrowe kolory', 'Zaokrąglone przyciski', 'Układ dwukolumnowy'] },
  ELECTRONICS: { industries: ['ELECTRONICS', 'COMPUTERS', 'GAMES', 'OFFICE', 'DIGITAL', 'GENERAL'], style: 'technical', features: ['Czytelne karty z ramką', 'Nowoczesny krój', 'Układ dwukolumnowy'] },
  TOYS: { industries: ['TOYS', 'KIDS', 'GIFTS', 'HOBBY', 'STATIONERY', 'PETS'], style: 'colorful', features: ['Radosne kolory', 'Zaokrąglony krój', 'Karty z cieniem'] },
  HOME: { industries: ['HOME', 'FURNITURE', 'GARDEN', 'HANDMADE', 'FOOD', 'GROCERY', 'ECO', 'BOOKS'], style: 'natural', features: ['Ciepłe barwy', 'Szeryfowe nagłówki', 'Delikatne zaokrąglenia'] },
  SPORTS: { industries: ['SPORTS', 'OUTDOOR', 'MUSIC', 'GENERAL'], style: 'colorful', features: ['Kontrastowy baner', 'Dynamiczne kolory', 'Karty z ramką'] },
  AUTOMOTIVE: { industries: ['AUTOMOTIVE', 'TOOLS', 'BUILDING', 'HOUSEHOLD'], style: 'technical', features: ['Mocny baner', 'Ostre krawędzie', 'Czytelne parametry'] },
  JEWELRY: { industries: ['JEWELRY', 'JEWELLER', 'ACCESSORIES', 'PERFUMES'], style: 'minimal', features: ['Dużo światła', 'Wyśrodkowany nagłówek', 'Oszczędna forma'] },
};

export function metaOf(code: string): ThemeMeta {
  return THEME_META[code] ?? { industries: [], style: 'minimal', features: [] };
}

export const FONT_STACKS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif', serif: 'ui-serif, Georgia, serif',
  rounded: 'ui-rounded, "Segoe UI", system-ui, sans-serif', mono: 'ui-monospace, Menlo, monospace',
  editorial: 'ui-sans-serif, system-ui, sans-serif',
};

/** Heading font of the miniature (editorial pairs a serif heading with a sans body). */
export function displayStack(key: string | undefined): string {
  return key === 'editorial' ? 'ui-serif, Georgia, serif' : fontStack(key);
}

/** URL of a template image reference (`tpl:vera/hero` → its small variant); null for anything else. */
export function templateImageUrl(ref: unknown): string | null {
  const m = typeof ref === 'string' ? /^tpl:([a-z0-9]{2,20})\/([a-z0-9-]{2,40})$/.exec(ref) : null;
  return m ? `/api/v1/theme-assets/${m[1]}/${m[2]}-w400.jpg` : null;
}

export function fontStack(key: string | undefined): string {
  return FONT_STACKS[key ?? ''] ?? FONT_STACKS['sans'];
}

export function radiusOf(key: string | undefined, scale = 1): string {
  return key === 'none' ? '0' : key === 'round' ? `${14 * scale}px` : `${6 * scale}px`;
}

/** Text colour with better contrast on the given background (mirrors the storefront). */
export function onColor(hex: string | undefined): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#fff' : '#111';
}
