import type { SettingSchema } from './template-package';

/** Where a section's product list comes from (setting type `product_list`). */
export interface ProductListSetting { source: ProductSource; category?: string; count: number; }
export type ProductSource = 'newest' | 'bestsellers' | 'sale' | 'last_pieces' | 'top_rated' | 'back_in_stock' | 'category';
export const PRODUCT_SOURCES: ProductSource[] = ['newest', 'bestsellers', 'sale', 'last_pieces', 'top_rated', 'back_in_stock', 'category'];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const IMAGE_REF = /^(asset:[a-z0-9][a-z0-9._-]{0,80}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** A link a template may render: store-relative path, anchor, https URL, mail/phone or a legal page placeholder. */
export function safeLink(value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  if (/^\/(?!\/)[^\s\\]*$/.test(v) || /^#[A-Za-z][\w-]*$/.test(v) || /^https:\/\/[^\s\\]+$/.test(v)) return v;
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(v) || /^tel:\+?[\d ()-]{3,20}$/.test(v)) return v;
  if (/^legal:(TERMS|PRIVACY|RETURNS|SHIPPING)$/.test(v)) return v;
  return '';
}

function text(value: unknown, max: number | undefined, multiline: boolean): string {
  let v = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  // Control characters out; newlines only where the field allows them
  v = v.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  return v.slice(0, max ?? (multiline ? 2000 : 300));
}

/**
 * The value of one setting: the stored value when valid, otherwise the schema default. Never throws — the renderer must
 * draw the page even when stored data predates a schema change (the backend validates on save).
 */
export function settingValue(schema: SettingSchema, stored: unknown): unknown {
  const value = stored === undefined ? schema.default : stored;
  const fallback = (): unknown => (stored === undefined ? emptyOf(schema) : settingValue(schema, undefined));
  switch (schema.type) {
    case 'text':
      return text(value, schema.max, false);
    case 'textarea':
      return text(value, schema.max, true);
    case 'url':
      if (typeof value !== 'string') return fallback();
      // An empty link is a choice ("no link"); an invalid one falls back to the default
      return value.trim() === '' ? '' : safeLink(value) || fallback();
    case 'image':
      return typeof value === 'string' && IMAGE_REF.test(value) ? value : value === '' || value == null ? '' : fallback();
    case 'color':
      return typeof value === 'string' && COLOR.test(value) ? value.toLowerCase() : fallback();
    case 'checkbox':
      return typeof value === 'boolean' ? value : fallback();
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback();
      return Math.round(Math.min(schema.max ?? 1e6, Math.max(schema.min ?? 0, n)));
    }
    case 'select':
      return schema.options?.some((o) => o.value === value) ? value : fallback();
    case 'product_list': {
      const v = (value ?? {}) as Partial<ProductListSetting>;
      if (!v || typeof v !== 'object' || !PRODUCT_SOURCES.includes(v.source as ProductSource)) return fallback();
      const count = Math.round(Math.min(24, Math.max(1, Number(v.count) || 6)));
      const category = typeof v.category === 'string' && SLUG.test(v.category) ? v.category : undefined;
      if (v.source === 'category' && !category) return fallback();
      return { source: v.source as ProductSource, count, ...(category ? { category } : {}) } satisfies ProductListSetting;
    }
    case 'category_list': {
      const v = (value ?? {}) as { mode?: string; slugs?: unknown };
      if (v.mode === 'selected' && Array.isArray(v.slugs)) {
        return { mode: 'selected', slugs: v.slugs.filter((s) => typeof s === 'string' && SLUG.test(s)).slice(0, 24) };
      }
      return { mode: 'top' };
    }
    case 'link_list': {
      if (!Array.isArray(value)) return fallback();
      return value.slice(0, schema.max ?? 12).flatMap((l) => {
        const label = text((l as { label?: unknown })?.label, 60, false);
        const url = safeLink((l as { url?: unknown })?.url);
        return label && url ? [{ label, url }] : [];
      });
    }
    default:
      return null;
  }
}

function emptyOf(schema: SettingSchema): unknown {
  switch (schema.type) {
    case 'checkbox': return false;
    case 'number': return schema.min ?? 0;
    case 'link_list': return [];
    case 'category_list': return { mode: 'top' };
    case 'product_list': return { source: 'newest', count: 4 };
    case 'select': return schema.options?.[0]?.value ?? '';
    default: return '';
  }
}

export function settingsOf(schemas: SettingSchema[], stored: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of schemas) out[s.id] = settingValue(s, stored?.[s.id]);
  return out;
}
