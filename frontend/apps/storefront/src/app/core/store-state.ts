import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { DISPLAY_FONTS, FONTS, RADII, contrast, readableOn, readableTint } from './format';
import { PublicCategory, PublicStore, StorefrontApi, ThemeConfig } from '../storefront-api';

/** Template codes this storefront build knows how to draw (keep in sync with ThemeRegistry.PRESETS). */
export const SUPPORTED_TEMPLATES = ['VERA', 'BAWILOO'];

/** The store being browsed (loaded once per page load, shared by all pages). */
@Injectable({ providedIn: 'root' })
export class StoreState {
  private readonly api = inject(StorefrontApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly loaded = signal<PublicStore | null>(null);
  /** Unsaved theme sent by the merchant's editor (preview only). */
  private readonly live = signal<{ theme: ThemeConfig; images: Record<string, Record<string, string>> } | null>(null);
  readonly store = computed<PublicStore | null>(() => {
    const s = this.loaded();
    const l = this.live();
    return s && l ? { ...s, theme: l.theme, themeImages: { ...s.themeImages, ...l.images } } : s;
  });
  readonly status = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  private loading: Promise<void> | null = null;

  readonly settings = computed(() => this.store()?.theme.settings ?? {});
  /** Cart opens as a side panel (default) or the cart icon leads to the cart page ("Koszyk" in the editor). */
  readonly cartDrawer = computed(() => this.settings()['cartStyle'] !== 'page');
  /** Light or dark page background — some details (blend modes, shadows) differ. */
  readonly tone = computed<'light' | 'dark'>(() => (readableOn(this.settings()['background'] ?? '#ffffff') === '#ffffff' ? 'dark' : 'light'));
  /** Enabled home-page sections (older configurations without sections get a simple default). */
  readonly sections = computed(() => {
    const list = this.store()?.theme.sections;
    if (list?.length) return list.filter((s) => s.enabled);
    return [{ id: 'hero', type: 'hero', enabled: true, data: { heading: '', subheading: '', cta: 'Zobacz produkty', link: '/produkty', image: '', layout: 'centered', height: 'medium' } },
      { id: 'cats', type: 'categories', enabled: true, data: { heading: 'Kategorie', categories: [], style: 'chips' } },
      { id: 'new', type: 'products', enabled: true, data: { heading: 'Nowości', source: 'newest', count: '8', buttonText: 'Wszystkie produkty' } }];
  });

  /**
   * Layout code of the template: templates with their own header, footer and product card ship their components in
   * app/themes/<code>; the rest share the standard layout.
   */
  readonly layout = computed<'vera' | 'bawiloo' | 'standard'>(() => {
    const code = this.store()?.theme.code;
    return code === 'VERA' ? 'vera' : code === 'BAWILOO' ? 'bawiloo' : 'standard';
  });

  /** URL of a theme image: the store's library (uuid) or the template's own images (`tpl:…`); null when unknown. */
  image(id: string | null | undefined, variant: 'w400' | 'w1200' = 'w1200'): string | null {
    return id ? this.store()?.themeImages?.[id]?.[variant] ?? null : null;
  }

  readonly topCategories = computed(() => (this.store()?.categories ?? []).filter((c) => c.depth === 0));

  /** CSS custom properties of the theme, applied on the root element. */
  readonly cssVars = computed(() => {
    const s = this.settings();
    if (!s['primary']) return '';
    const vars: Record<string, string> = {
      '--sf-primary': s['primary'], '--sf-on-primary': readableOn(s['primary']), '--sf-accent': s['accent'],
      '--sf-bg': s['background'], '--sf-surface': s['surface'], '--sf-text': s['text'],
      '--sf-font': FONTS[s['font']] ?? FONTS['sans'], '--sf-radius': RADII[s['radius']] ?? RADII['soft'],
      '--sf-font-display': DISPLAY_FONTS[s['font']] ?? FONTS[s['font']] ?? FONTS['sans'],
      // Status colours stay readable on dark templates (WCAG AA on the page background)
      // Text on the accent colour (header bars): the store's text colour if it reads well there, else black/white
      '--sf-on-accent': contrast(s['text'], s['accent']) >= 4.5 ? s['text'] : readableOn(s['accent']),
      // The accent as small text (prices, labels) — darkened/lightened until it is readable on the page background
      '--sf-accent-ink': readableTint(s['accent'], s['background']),
      '--sf-danger': readableOn(s['background']) === '#ffffff' ? '#ff8a6b' : '#b42318',
      '--sf-success': readableOn(s['background']) === '#ffffff' ? '#5bd68a' : '#087443',
    };
    return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  });

  load(): Promise<void> {
    this.loading ??= firstValueFrom(this.api.store()).then(
      (store) => {
        this.loaded.set(store);
        this.status.set('ready');
        if (this.browser && store.preview && store.panelOrigin) this.listenToEditor(store.panelOrigin);
      },
      (e) => this.status.set(e?.status === 404 ? 'not-found' : 'error'),
    );
    return this.loading;
  }

  children(parentId: string | null): PublicCategory[] {
    return (this.store()?.categories ?? []).filter((c) => c.parentId === parentId);
  }

  category(slug: string): PublicCategory | undefined {
    return this.store()?.categories.find((c) => c.slug === slug);
  }

  /** Path from the root to the category (breadcrumbs). */
  pathTo(slug: string): PublicCategory[] {
    const all = this.store()?.categories ?? [];
    const path: PublicCategory[] = [];
    let current = all.find((c) => c.slug === slug);
    while (current) {
      path.unshift(current);
      current = current.parentId ? all.find((c) => c.id === current!.parentId) : undefined;
    }
    return path;
  }

  /**
   * Live preview for the theme editor: the panel (and only the panel's origin) may send an unsaved theme; it changes
   * what this tab shows and nothing else. The message is checked for shape; texts are rendered as text, images only
   * from the store's media path.
   */
  private listenToEditor(origin: string): void {
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== window.parent) return;
      const d = e.data;
      if (d?.type !== 'shopivo:theme' || typeof d.theme?.code !== 'string' || typeof d.theme?.settings !== 'object' || !Array.isArray(d.theme?.sections)) return;
      const settings: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.theme.settings as Record<string, unknown>)) if (typeof v === 'string' && v.length <= 400) settings[k] = v;
      const images: Record<string, Record<string, string>> = {};
      for (const [id, urls] of Object.entries((d.images ?? {}) as Record<string, Record<string, unknown>>)) {
        const tpl = /^tpl:[a-z0-9]{2,20}\/[a-z0-9-]{2,40}$/.test(id);
        if (!tpl && !/^[0-9a-f-]{36}$/.test(id)) continue;
        const prefix = tpl ? '/api/v1/theme-assets/' : '/api/v1/media/';
        images[id] = Object.fromEntries(Object.entries(urls ?? {}).filter(([, u]) => typeof u === 'string' && u.startsWith(prefix) && !u.includes('..'))) as Record<string, string>;
      }
      this.live.set({ theme: { code: d.theme.code, settings, sections: d.theme.sections.slice(0, 30) }, images });
    });
    // Tells the editor which templates this storefront build can draw (an older build would show a wrong preview)
    window.parent?.postMessage({ type: 'shopivo:ready', templates: SUPPORTED_TEMPLATES }, origin);
  }
}
