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
  BAWILOO: { industries: ['TOYS', 'KIDS', 'GIFTS', 'HOBBY'], style: 'colorful',
    features: ['Jasny, złoty wygląd i 16 przykładowych zabawek', 'Kategorie ze zdjęciami bez tła i slider promocji', 'Ilustrowane ikony korzyści'] },
  VELMIRA: { industries: ['COSMETICS', 'PERFUMES', 'MEDICAL', 'ECO'], style: 'natural',
    features: ['Duży slider z bocznym kafelkiem', 'Karuzela produktów z zakładkami i rytuały krok po kroku', 'Pytania i odpowiedzi, wyróżniony zestaw z ceną'] },
  LULLORA: { industries: ['KIDS', 'TOYS', 'COSMETICS', 'GIFTS'], style: 'colorful',
    features: ['Zdjęcie z wycięciami i kafelki pod banerem', 'Katalog z filtrem kategorii na stronie głównej', 'Osobne, spójne widoki koszyka, konta i zamówienia'] },
  VERA: { industries: ['FASHION', 'FOOTWEAR', 'ACCESSORIES', 'JEWELRY'], style: 'elegant',
    features: ['Własne zdjęcia szablonu (do podmiany)', 'Kafelki działów i filtry produktów', 'Boczny koszyk z progiem darmowej dostawy'] },
};

export function metaOf(code: string): ThemeMeta {
  return THEME_META[code] ?? { industries: [], style: 'minimal', features: [] };
}

export const FONT_STACKS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif', serif: 'ui-serif, Georgia, serif',
  rounded: 'ui-rounded, "Segoe UI", system-ui, sans-serif', mono: 'ui-monospace, Menlo, monospace',
  editorial: 'ui-sans-serif, system-ui, sans-serif',
  playful: 'ui-rounded, "Segoe UI", system-ui, sans-serif',
};

/** Heading font of the miniature (editorial pairs a serif heading with a sans body). */
export function displayStack(key: string | undefined): string {
  return key === 'editorial' ? 'ui-serif, Georgia, serif' : key === 'playful' ? 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif' : fontStack(key);
}

/** Template image reference → its small variant URL, from the theme API response. */
export function templateImageMap(list: { ref: string; urls: Record<string, string> }[] | undefined): Record<string, string> {
  return Object.fromEntries((list ?? []).map((i) => [i.ref, i.urls['w400']]));
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

/** Screenshot of a v2 template's demo for the gallery (tpl:<code>/preview and /preview-phone), when the template has one. */
export function templatePreview(list: { ref: string; urls: Record<string, string> }[] | undefined, code: string, phone = false): string | null {
  const ref = `tpl:${code.toLowerCase()}/preview${phone ? '-phone' : ''}`;
  return (list ?? []).find((i) => i.ref === ref)?.urls['w400'] ?? null;
}

/** Gallery screenshots are not images to put into a store. */
export function isPreview(ref: string): boolean {
  return /\/preview(-phone)?$/.test(ref);
}
