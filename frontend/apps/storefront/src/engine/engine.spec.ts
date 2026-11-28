import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageSize } from './image-size';
import { TemplateRenderer, formatMoney, resolveLink } from './renderer';
import { routeOf } from './routes';
import { safeLink, settingValue, settingsOf } from './settings';
import type { ApiCard, ApiStore, StoreApi } from './store-data';
import { groupAccount, toCart, toProduct } from './store-data';
import { PAGE_TYPES, loadAll, templatesDir, type TemplatePackage } from './template-package';

const packages = loadAll(templatesDir());

function card(i: number, extra: Partial<ApiCard> = {}): ApiCard {
  return {
    id: `00000000-0000-4000-8000-00000000000${i}`, slug: `zabawka-${i}`, name: `Zabawka <${i}>`, brand: null, priceMinor: 1799,
    maxPriceMinor: 1799, compareAtMinor: 2299, lowestPrice30dMinor: 1999, currency: 'PLN', available: true,
    imageUrl: `/api/v1/media/t/i${i}/w400.png`, imageAlt: null, imageColor: '#963bb0', ...extra,
  };
}

const store: ApiStore = {
  name: 'Sklep "Mały" & Duży', status: 'PUBLISHED', open: true, preview: false, currency: 'PLN', hostname: 'x.shopivo.pl',
  theme: { code: 'BAWILOO', settings: {} },
  categories: [
    { id: 'c1', parentId: null, name: 'Pluszaki', slug: 'pluszaki', depth: 0, image: { w400: '/c1-w400.png', w1200: '/c1-w1200.png' } },
    { id: 'c2', parentId: 'c1', name: 'Misie', slug: 'misie', depth: 1, image: null },
  ],
  footerLinks: [{ title: 'Polityka prywatności', path: '/strona/polityka-prywatnosci', systemKey: 'PRIVACY' }],
  themeImages: {}, panelOrigin: null,
};

/** A storefront API stand-in that answers every list with the same cards and records the requests. */
function fakeApi(calls: string[]): StoreApi {
  const answer = (path: string): unknown => {
    calls.push(path);
    if (path.startsWith('/products?')) return { items: [card(1), card(2)], page: 0, size: 12, totalItems: 2, totalPages: 1 };
    return [card(1), card(2), card(3)];
  };
  return {
    get: async (path: string) => answer(path),
    optional: async (path: string) => answer(path),
    cart: async () => null,
  } as unknown as StoreApi;
}

describe('template packages', () => {
  it('load with every page, section schema and asset', () => {
    expect([...packages.keys()]).toContain('BAWILOO');
    const p = packages.get('BAWILOO')!;
    for (const type of PAGE_TYPES) expect(p.pages[type].order.length).toBeGreaterThan(0);
    expect(p.assets.get('hero.webp')).toEqual({ width: 1738, height: 675 });
    expect(p.assets.get('cat-pluszaki.png')).toEqual({ width: 268, height: 297 });
  });

  // The designer's stylesheet is compiled Tailwind: a utility class that is not in it does nothing. Every class the
  // template's Liquid uses must exist in its CSS (new ones go to the "Shopivo additions" block).
  it.each([...packages.values()].map((p) => [p.code, p] as const))('%s uses only classes its stylesheet defines', (_code, p: TemplatePackage) => {
    const css = p.styles.map((f) => readFileSync(join(p.dir, f), 'utf8')).join('\n');
    const escape = (c: string) => c.replace(/([[\]()/:#.,%!&+*'>=~@])/g, '\\$1');
    const sources = [...p.sections.values()].map((s) => s.source).concat(Object.values(p.snippets), p.layout);
    const missing = new Set<string>();
    const known = new Set(['product-card', 'category-link']);
    for (const src of sources) {
      const plain = src.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, '');
      const lists = [...plain.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
      lists.push(...[...src.matchAll(/(?:classes|del_class|field|gold|outline)\s*[:=]\s*'([^']*)'/g)].map((m) => m[1]));
      for (const list of lists) for (const c of list.split(/\s+/).filter(Boolean)) {
        if (!known.has(c) && !css.includes('.' + escape(c))) missing.add(c);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe('settings', () => {
  it('fall back to schema defaults and keep only safe values', () => {
    const schema = [
      { id: 'title', type: 'text' as const, label: '', default: 'Domyślny', max: 10 },
      { id: 'url', type: 'url' as const, label: '', default: '/produkty' },
      { id: 'n', type: 'number' as const, label: '', default: 6, min: 2, max: 12 },
      { id: 'style', type: 'select' as const, label: '', default: 'a', options: [{ value: 'a', label: '' }, { value: 'b', label: '' }] },
    ];
    expect(settingsOf(schema, undefined)).toEqual({ title: 'Domyślny', url: '/produkty', n: 6, style: 'a' });
    expect(settingsOf(schema, { title: 'Bardzo długi tytuł\u0000', url: 'javascript:alert(1)', n: 99, style: 'x' }))
      .toEqual({ title: 'Bardzo dłu', url: '/produkty', n: 12, style: 'a' });
    expect(settingValue({ id: 'p', type: 'product_list', label: '' }, { source: 'category' })).toEqual({ source: 'newest', count: 4 });
    expect(settingValue({ id: 'p', type: 'product_list', label: '' }, { source: 'sale', category: 'pluszaki', count: 50 }))
      .toEqual({ source: 'sale', category: 'pluszaki', count: 24 });
  });

  it('allow only store links, anchors, https and legal page placeholders', () => {
    expect(['/produkty', '#contact', 'https://x.pl/a', 'legal:PRIVACY', 'mailto:a@b.pl'].map(safeLink))
      .toEqual(['/produkty', '#contact', 'https://x.pl/a', 'legal:PRIVACY', 'mailto:a@b.pl']);
    expect(['//evil.com', 'http://x.pl', 'javascript:alert(1)', 'legal:OTHER', '/a b'].map(safeLink)).toEqual(['', '', '', '', '']);
    expect(resolveLink('legal:PRIVACY', [{ key: 'PRIVACY', url: '/strona/p' }])).toBe('/strona/p');
    expect(resolveLink('legal:TERMS', [])).toBe('/');
  });
});

describe('rendering', () => {
  it('renders the home page with store data, escaped merchant text and no editor attributes for visitors', async () => {
    const p = packages.get('BAWILOO')!;
    const calls: string[] = [];
    const r = new TemplateRenderer(p, '/_t/bawiloo/' + p.version);
    const html = await r.renderPage({
      pkg: p, api: fakeApi(calls), store, pageType: 'index', page: {}, cart: toCart(null), head: '<title>T</title>', footer: '',
    });
    expect(html).toContain('KAŻDA ZABAWKA<br/>TO NOWA RADOŚĆ');
    expect(html).toMatch(/Sklep &(quot|#34);Mały&(quot|#34); &amp; Duży/); // store name escaped
    expect(html).not.toContain('"Mały"');
    expect(html).toContain('Zabawka &lt;1&gt;');
    expect(html).not.toContain('<1>');
    expect(html).toContain('PLUSZAKI');
    expect(html).not.toContain('MISIE'); // only top-level categories
    expect(html).toContain('href="/strona/polityka-prywatnosci"');
    expect(html).toContain('/_t/bawiloo/' + p.version + '/hero.webp');
    expect(html).toContain('Najniższa cena z 30 dni przed obniżką');
    expect(html).toContain('--product-color:#963bb0');
    expect(html).not.toContain('data-shop-edit');
    expect(calls).toContain('/collections/bestsellery?limit=6');
    expect(calls).toContain('/collections/promocje?limit=5&kategoria=pluszaki');
  });

  it('adds editor hooks only while editing', async () => {
    const p = packages.get('BAWILOO')!;
    const r = new TemplateRenderer(p, '/_t/b/1');
    const html = await r.renderSections({
      pkg: p, api: fakeApi([]), store, pageType: 'index', page: {}, cart: toCart(null), head: '', footer: '', editing: true,
    }, ['hero', 'benefits']);
    expect(Object.keys(html).sort()).toEqual(['benefits', 'hero']);
    expect(html['hero']).toContain('data-shop-edit="hero:heading"');
    expect(html['benefits']).toContain('data-shop-block="benefits/benefit-1"');
    expect(html['benefits']).toContain('data-shop-edit="benefits/benefit-1:title"');
  });
});

describe('helpers', () => {
  it('formats money, maps routes and reads image sizes', () => {
    expect(formatMoney(1799, 'PLN').replace(/\s/g, ' ')).toBe('17,99 zł');
    expect(routeOf('/')).toEqual({ type: 'index' });
    expect(routeOf('/kategoria/pluszaki')).toEqual({ type: 'catalog', slug: 'pluszaki' });
    expect(routeOf('/produkt/Zla%20nazwa')).toEqual({ type: 'not_found' });
    expect(routeOf('/zamowienie')).toEqual({ type: 'checkout' });
    expect(routeOf('/blog/pierwszy-wpis')).toEqual({ type: 'page', slug: 'pierwszy-wpis', post: true });
    expect(routeOf('/konto')).toBeNull();
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000064000000c8', 'hex');
    expect(imageSize(Buffer.concat([png, Buffer.alloc(8)]))).toEqual({ width: 100, height: 200 });
    expect(groupAccount('PL61109010140000071219812874')).toBe('PL61 1090 1014 0000 0712 1981 2874');
    expect(groupAccount('61 1090 1014 0000 0712 1981 2874')).toBe('61 1090 1014 0000 0712 1981 2874');
    const p = toProduct(card(1));
    expect(p).toMatchObject({ on_sale: true, discount: 22, url: '/produkt/zabawka-1', color: '#963bb0' });
    expect(p.image?.w1200).toBe('/api/v1/media/t/i1/w1200.png');
  });
});
