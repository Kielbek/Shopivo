import { Liquid, type Template } from 'liquidjs';
import { safeLink, settingsOf, type ProductListSetting } from './settings';
import {
  toCategory, toProduct, toProductDetail, type ApiCard, type ApiProduct, type ApiStore, type StoreApi, type TplImage,
} from './store-data';
import type { PageDoc, PageType, SectionDoc, SettingSchema, TemplatePackage } from './template-package';

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPE[c]);

const money = new Map<string, Intl.NumberFormat>();
export function formatMoney(minor: unknown, currency: unknown = 'PLN'): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return '';
  const cur = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'PLN';
  let f = money.get(cur);
  if (!f) money.set(cur, (f = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: cur })));
  return f.format(n / 100);
}

/** A stored link as an href: legal page placeholders become the store's page (its home page when it has none yet). */
export function resolveLink(v: unknown, legal: { url: string; key: string }[]): string {
  const url = safeLink(v);
  if (!url.startsWith('legal:')) return url;
  return legal.find((l) => l.key === url.slice('legal:'.length))?.url ?? '/';
}

/** Collections of the recommendations API behind each product-list source. */
const COLLECTION: Record<string, string> = {
  bestsellers: 'bestsellery', sale: 'promocje', last_pieces: 'koncowki', top_rated: 'najlepiej-oceniane',
  back_in_stock: 'wracaja', newest: 'nowosci',
};

export interface RenderContext {
  pkg: TemplatePackage;
  api: StoreApi;
  store: ApiStore;
  pageType: PageType;
  /** Page data the main section needs (catalog, product, cart…), already in template shape. */
  page: Record<string, unknown>;
  cart: unknown;
  /** Draft documents from the editor; template defaults otherwise. */
  docs?: { pages?: Partial<Record<PageType, PageDoc>>; header?: PageDoc; footer?: PageDoc };
  editing?: boolean;
  head: string;
  footer: string;
}

interface Section { id: string; type: string; settings: Record<string, unknown>; blocks: Block[]; }
interface Block { id: string; type: string; settings: Record<string, unknown>; }

/**
 * Renders pages of one template package with LiquidJS. Output is escaped by default; only the platform filters marked
 * `raw` (attributes, line breaks) return HTML, and they escape their input themselves.
 */
export class TemplateRenderer {
  private readonly liquid: Liquid;
  private readonly parsed = new Map<string, Template[]>();

  constructor(readonly pkg: TemplatePackage, readonly assetBase: string) {
    this.liquid = new Liquid({
      // Snippets from memory: no file system access while rendering (and no path tricks in {% render %})
      templates: pkg.snippets, extname: '', cache: true, outputEscape: 'escape', strictFilters: true,
      ownPropertyOnly: true, relativeReference: false, jsTruthy: false,
    });
    this.registerFilters();
  }

  private registerFilters(): void {
    const l = this.liquid;
    l.registerFilter('money', (v: unknown, currency: unknown) => formatMoney(v, currency));
    // Escapes, then turns line breaks into <br> (merchant text in multi-line fields)
    l.registerFilter('lines', { handler: (v: unknown) => escapeHtml(v).replace(/\r?\n/g, '<br/>'), raw: true });
    l.registerFilter('link', function (this: { context: { getSync(path: string[]): unknown } }, v: unknown) {
      return resolveLink(v, (this.context.getSync(['shop', 'legal_links']) ?? []) as { url: string; key: string }[]);
    });
    l.registerFilter('asset_url', (file: unknown) => this.assetUrl(String(file)));
    l.registerFilter('image_url', (img: unknown, variant: unknown) => {
      if (!img || typeof img !== 'object') return '';
      const i = img as Record<string, string>;
      return i[String(variant)] ?? i['w1200'] ?? i['w400'] ?? '';
    });
    l.registerFilter('image_srcset', (img: unknown) => {
      if (!img || typeof img !== 'object') return '';
      const i = img as TplImage;
      if (i.asset) return i.width ? `${i.w1200} ${i.width}w` : '';
      return `${i.w400} 400w, ${i.w1200} 1200w`;
    });
    // Editor hooks: attributes only while the merchant edits in the panel's preview, empty for visitors.
    const pkg = this.pkg;
    /** Type of the setting an editor hook points at (text and textarea are edited in place, images open the picker). */
    const settingType = (t: { type?: string; section_type?: string }, id: string): string => {
      const section = pkg.sections.get(t.section_type ?? t.type ?? '');
      const list = t.section_type ? section?.schema.blocks?.find((b) => b.type === t.type)?.settings : section?.schema.settings;
      return list?.find((x) => x.id === id)?.type ?? '';
    };
    l.registerFilter('edit', {
      handler: function (this: { context: { getSync(path: string[]): unknown } }, target: unknown, setting: unknown) {
        if (!this.context.getSync(['editing'])) return '';
        const t = target as { id?: string; type?: string; section_id?: string; section_type?: string } | null;
        if (!t?.id || typeof setting !== 'string' || !/^[a-z0-9_]+$/.test(setting)) return '';
        const path = t.section_id ? `${t.section_id}/${t.id}` : t.id;
        return ` data-shop-edit="${escapeHtml(path)}:${setting}" data-shop-edit-type="${escapeHtml(settingType(t, setting))}"`;
      },
      raw: true,
    });
    l.registerFilter('block_attrs', {
      handler: function (this: { context: { getSync(path: string[]): unknown } }, block: unknown) {
        if (!this.context.getSync(['editing'])) return '';
        const b = block as { id?: string; section_id?: string } | null;
        return b?.id ? ` data-shop-block="${escapeHtml(b.section_id)}/${escapeHtml(b.id)}"` : '';
      },
      raw: true,
    });
  }

  assetUrl(file: string): string {
    return this.pkg.assets.has(file) ? `${this.assetBase}/${encodeURIComponent(file)}` : '';
  }

  private template(key: string, source: string): Template[] {
    let t = this.parsed.get(key);
    if (!t) this.parsed.set(key, (t = this.liquid.parse(source, key)));
    return t;
  }

  /** The image a setting points at: a template asset ("asset:file") or an image from the store's library (id). */
  private image(ref: unknown, store: ApiStore): TplImage | null {
    if (typeof ref !== 'string' || !ref) return null;
    if (ref.startsWith('asset:')) {
      const file = ref.slice('asset:'.length);
      if (!this.pkg.assets.has(file)) return null;
      const url = this.assetUrl(file);
      const size = this.pkg.assets.get(file);
      return { w400: url, w1200: url, asset: true, width: size?.width, height: size?.height };
    }
    const urls = store.themeImages?.[ref];
    return urls ? { w400: urls['w400'], w1200: urls['w1200'] } : null;
  }

  /** Settings with data attached: images, product lists and category lists are resolved here, in parallel. */
  private async resolve(ctx: RenderContext, schemaSettings: SettingSchema[], values: Record<string, unknown>): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const s of schemaSettings) {
      const v = values[s.id];
      if (s.type === 'image') values[s.id] = this.image(v, ctx.store);
      else if (s.type === 'product') {
        jobs.push((typeof v === 'string' && v ? ctx.api.optional<ApiProduct | null>(`/products/${encodeURIComponent(v)}`, null) : Promise.resolve(null))
          .then((p) => { values[s.id] = p ? toProductDetail(p) : null; }));
      }
      else if (s.type === 'product_list') jobs.push(this.products(ctx, v as ProductListSetting).then((r) => { values[s.id] = r; }));
      else if (s.type === 'category_list') {
        const cats = this.categories(ctx.store, v as { mode: string; slugs?: string[] });
        values[s.id] = cats;
        const n = Math.min(24, Math.max(0, Math.round(s.products_per_category ?? 0)));
        if (n) {
          for (const c of cats as Record<string, unknown>[]) {
            jobs.push(this.products(ctx, { source: 'category', category: c['slug'] as string, count: n }).then((r) => { c['items'] = r.items; }));
          }
        }
      }
    }
    await Promise.all(jobs);
  }

  private async products(ctx: RenderContext, list: ProductListSetting) {
    const n = list.count;
    const cat = list.category ? `&kategoria=${encodeURIComponent(list.category)}` : '';
    let cards: ApiCard[];
    if (list.source === 'category') {
      cards = (await ctx.api.optional<{ items: ApiCard[] }>(`/products?size=${n}${cat}`, { items: [] })).items;
    } else {
      cards = await ctx.api.optional<ApiCard[]>(`/collections/${COLLECTION[list.source]}?limit=${n}${cat}`, []);
    }
    const url = list.source === 'sale' ? '/produkty?promocje=tak' + (list.category ? '&kategoria=' + encodeURIComponent(list.category) : '')
      : list.category ? '/kategoria/' + encodeURIComponent(list.category) : '/produkty';
    return { items: cards.map(toProduct), source: list.source, url };
  }

  private categories(store: ApiStore, v: { mode: string; slugs?: string[] }) {
    const all = store.categories.map(toCategory);
    if (v.mode === 'selected' && v.slugs) return v.slugs.map((s) => all.find((c) => c.slug === s)).filter((c) => !!c);
    return all.filter((c) => c.depth === 0);
  }

  private async section(ctx: RenderContext, id: string, doc: SectionDoc): Promise<Section | null> {
    const def = this.pkg.sections.get(doc.type);
    if (!def || doc.disabled) return null;
    const settings = settingsOf(def.schema.settings, doc.settings);
    const jobs = [this.resolve(ctx, def.schema.settings, settings)];
    const blocks: Block[] = [];
    for (const bid of doc.block_order ?? []) {
      const b = doc.blocks?.[bid];
      const bdef = def.schema.blocks?.find((x) => x.type === b?.type);
      if (!b || !bdef || b.disabled) continue;
      const bs = settingsOf(bdef.settings, b.settings);
      jobs.push(this.resolve(ctx, bdef.settings, bs));
      blocks.push({ id: bid, type: b.type, settings: bs });
      if (def.schema.max_blocks && blocks.length >= def.schema.max_blocks) break;
    }
    await Promise.all(jobs);
    return { id, type: doc.type, settings, blocks };
  }

  private globals(ctx: RenderContext): Record<string, unknown> {
    const s = ctx.store;
    return {
      shop: {
        name: s.name, currency: s.currency, hostname: s.hostname, captcha_site_key: s.captchaSiteKey ?? null,
        categories: s.categories.map(toCategory).filter((c) => c.depth === 0),
        all_categories: s.categories.map(toCategory),
        legal_links: s.footerLinks.filter((l) => l.systemKey).map((l) => ({ title: l.title, url: l.path, key: l.systemKey })),
      },
      cart: ctx.cart, page_type: ctx.pageType, editing: !!ctx.editing, template: { code: this.pkg.code, version: this.pkg.version },
      ...ctx.page,
    };
  }

  /** Renders the sections of one document; `only` limits it to some section ids (partial updates). */
  async renderDoc(ctx: RenderContext, doc: PageDoc, only?: Set<string>): Promise<Map<string, string>> {
    const ids = doc.order.filter((id) => !only || only.has(id));
    const sections = await Promise.all(ids.map((id) => this.section(ctx, id, doc.sections[id])));
    const globals = this.globals(ctx);
    const out = new Map<string, string>();
    await Promise.all(sections.map(async (sec) => {
      if (!sec) return;
      const def = this.pkg.sections.get(sec.type)!;
      const section = { ...sec, blocks: sec.blocks.map((b) => ({ ...b, section_id: sec.id, section_type: sec.type })) };
      const html = await this.liquid.render(this.template('section:' + sec.type, def.source), { section }, { globals });
      const attrs = ctx.editing ? ` data-shop-section-type="${escapeHtml(sec.type)}"` : '';
      out.set(sec.id, `<div id="shop-section-${escapeHtml(sec.id)}" data-shop-section="${escapeHtml(sec.id)}"${attrs} style="display:contents">${html}</div>`);
    }));
    return out;
  }

  /** Sections in order; while editing, inert markers around them tell the editor where the group starts and ends. */
  private joined(doc: PageDoc, html: Map<string, string>, group: string, editing: boolean): string {
    const body = doc.order.map((id) => html.get(id) ?? '').join('\n');
    return editing ? `<template data-shop-group-start="${group}"></template>${body}<template data-shop-group-end="${group}"></template>` : body;
  }

  /** Documents of the page being rendered: the store's (draft or published) or the template's defaults. */
  private docsOf(ctx: RenderContext): { page: PageDoc; header: PageDoc; footer: PageDoc } {
    return {
      page: ctx.docs?.pages?.[ctx.pageType] ?? this.pkg.pages[ctx.pageType],
      header: ctx.docs?.header ?? this.pkg.groups.header,
      footer: ctx.docs?.footer ?? this.pkg.groups.footer,
    };
  }

  /** Every section of the page, by group (the editor rebuilds the page from it after a change). */
  async renderGroups(ctx: RenderContext): Promise<Record<string, { order: string[]; html: Record<string, string> }>> {
    const d = this.docsOf(ctx);
    const out: Record<string, { order: string[]; html: Record<string, string> }> = {};
    await Promise.all((['page', 'header', 'footer'] as const).map(async (g) => {
      const html = await this.renderDoc(ctx, d[g]);
      out[g] = { order: d[g].order.filter((id) => html.has(id)), html: Object.fromEntries(html) };
    }));
    return out;
  }

  async renderPage(ctx: RenderContext): Promise<string> {
    const { page, header, footer } = this.docsOf(ctx);
    const [main, head, foot] = await Promise.all([this.renderDoc(ctx, page), this.renderDoc(ctx, header), this.renderDoc(ctx, footer)]);
    const e = !!ctx.editing;
    const scope = {
      content_for_layout: this.joined(page, main, 'page', e), header_group: this.joined(header, head, 'header', e),
      footer_group: this.joined(footer, foot, 'footer', e),
      content_for_header: ctx.head, content_for_footer: ctx.footer,
    };
    // Section output and the head are already escaped HTML: the layout prints them raw.
    const layout = this.pkg.layout.replace(/\{\{\s*(content_for_layout|header_group|footer_group|content_for_header|content_for_footer)\s*\}\}/g, '{{ $1 | raw }}');
    return this.liquid.render(this.template('layout', layout), scope, { globals: this.globals(ctx) });
  }

  /** Re-rendered sections of a page (the runtime swaps them in after a cart change, a filter…). */
  async renderSections(ctx: RenderContext, ids: string[]): Promise<Record<string, string>> {
    const d = this.docsOf(ctx);
    const docs = [d.page, d.header, d.footer];
    const want = new Set(ids);
    const out: Record<string, string> = {};
    for (const doc of docs) {
      const html = await this.renderDoc(ctx, doc, want);
      for (const [id, h] of html) out[id] = h;
    }
    return out;
  }
}
