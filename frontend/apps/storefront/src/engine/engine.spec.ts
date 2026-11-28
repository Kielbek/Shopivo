import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageSize } from './image-size';
import { TemplateRenderer, formatMoney, resolveLink } from './renderer';
import { routeOf } from './routes';
import { isShown, toTplDate, warsawToUtc } from './schedule';
import { safeLink, settingValue, settingsOf } from './settings';
import type { ApiCard, ApiStore, StoreApi } from './store-data';
import { ApiError, StoreApi as Api, groupAccount, toCart, toProduct } from './store-data';
import { PAGE_TYPES, loadAll, loadShared, templatesDir, type TemplatePackage } from './template-package';

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
    // The shared sections' stylesheet is on every page too
    const css = p.styles.map((f) => readFileSync(join(p.dir, f), 'utf8')).join('\n') + loadShared().css;
    const escape = (c: string) => c.replace(/([[\]()/:#.,%!&+*'>=~@])/g, '\\$1');
    const sources = [...p.sections.values()].map((s) => s.source).concat(Object.values(p.snippets), p.layout);
    const missing = new Set<string>();
    const known = new Set(['product-card', 'category-link']);
    for (const src of sources) {
      const plain = src.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, '');
      const lists = [...plain.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
      lists.push(...[...src.matchAll(/(?:classes|del_class|field|gold|outline)\s*[:=]\s*'([^']*)'/g)].map((m) => m[1]));
      for (const list of lists) for (const c of list.split(/\s+/).filter(Boolean)) {
        // a class completed by a setting ("shop-scheme--{{ … }}") is checked by its variants in the CSS
        if (!known.has(c) && !c.endsWith('-') && !css.includes('.' + escape(c))) missing.add(c);
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

  it('keep points on a picture within it, to one decimal; an optional point may be unset', () => {
    const point = { id: 'p', type: 'point' as const, label: '', default: { x: 50, y: 50 } };
    const optional = { id: 'm', type: 'point' as const, label: '', default: null };
    expect(settingValue(point, { x: 12.345, y: 140 })).toEqual({ x: 12.3, y: 100 });
    expect(settingValue(point, { x: 'a', y: 1 })).toEqual({ x: 50, y: 50 });
    expect(settingValue(point, undefined)).toEqual({ x: 50, y: 50 });
    expect(settingValue(optional, undefined)).toBeNull();
    expect(settingValue(optional, null)).toBeNull();
    expect(settingValue(optional, { x: -5, y: 30 })).toEqual({ x: 0, y: 30 });
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

  it('gives each category of a catalogue filter its own products (Lullora)', async () => {
    const calls: string[] = [];
    const p = packages.get('LULLORA')!;
    const html = await new TemplateRenderer(p, '/_t/l/1').renderSections({
      pkg: p, api: fakeApi(calls), store, pageType: 'index', page: {}, cart: toCart(null), head: '', footer: '',
    }, ['catalog']);
    expect(calls).toContain('/products?size=9&kategoria=pluszaki');
    expect(html['catalog']).toContain('data-cat-panel="pluszaki"');
    expect(html['catalog'].match(/data-cat-panel="pluszaki"[\s\S]*?<\/div>\n/)?.[0]).toContain('Zabawka &lt;1&gt;');
    expect(html['catalog']).not.toContain('data-cat="misie"'); // only top-level categories
  });

  it('adds editor hooks only while editing', async () => {
    const p = packages.get('BAWILOO')!;
    const r = new TemplateRenderer(p, '/_t/b/1');
    const html = await r.renderSections({
      pkg: p, api: fakeApi([]), store, pageType: 'index', page: {}, cart: toCart(null), head: '', footer: '', editing: true,
    }, ['hero', 'benefits']);
    expect(Object.keys(html).sort()).toEqual(['benefits', 'hero']);
    expect(html['hero']).toContain('data-shop-edit="hero:heading" data-shop-edit-type="textarea"');
    expect(html['hero']).toContain('data-shop-edit="hero:image" data-shop-edit-type="image"');
    expect(html['benefits']).toContain('data-shop-block="benefits/benefit-1"');
    expect(html['benefits']).toContain('data-shop-edit="benefits/benefit-1:title" data-shop-edit-type="text"');
  });
});

describe('store documents', () => {
  it('render the store order, settings and hidden sections, with editor markers only while editing', async () => {
    const p = packages.get('BAWILOO')!;
    const r = new TemplateRenderer(p, '/_t/b/1');
    const index = structuredClone(p.pages.index);
    index.order = ['about', 'hero'];
    index.sections['hero'].settings = { heading: 'Mój <napis>' };
    index.sections['about'].disabled = true;
    const base = { pkg: p, api: fakeApi([]), store, pageType: 'index' as const, page: {}, cart: toCart(null), head: '', footer: '' };
    const html = await r.renderPage({ ...base, docs: { pages: { index } } });
    expect(html).toContain('Mój &lt;napis&gt;');
    expect(html).not.toContain('id="shop-section-about"');
    expect(html).not.toContain('id="shop-section-categories"');
    expect(html).not.toContain('data-shop-group-start');
    const editing = await r.renderGroups({ ...base, docs: { pages: { index } }, editing: true });
    expect(editing['page'].order).toEqual(['hero']);
    expect(editing['header'].order).toEqual(['header']);
    const page = await r.renderPage({ ...base, editing: true });
    expect(page).toContain('<template data-shop-group-start="page"></template>');
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
    expect(routeOf('/konto')).toEqual({ type: 'account' });
    expect(routeOf('/konto/zamowienia/1001')).toEqual({ type: 'account_order', number: 1001 });
    expect(routeOf('/opinia')).toEqual({ type: 'review' });
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000064000000c8', 'hex');
    expect(imageSize(Buffer.concat([png, Buffer.alloc(8)]))).toEqual({ width: 100, height: 200 });
    expect(groupAccount('PL61109010140000071219812874')).toBe('PL61 1090 1014 0000 0712 1981 2874');
    expect(groupAccount('61 1090 1014 0000 0712 1981 2874')).toBe('61 1090 1014 0000 0712 1981 2874');
    const p = toProduct(card(1));
    expect(p).toMatchObject({ on_sale: true, discount: 22, url: '/produkt/zabawka-1', color: '#963bb0' });
    expect(p.image?.w1200).toBe('/api/v1/media/t/i1/w1200.png');
  });
});

describe('template preview', () => {
  afterEach(() => vi.unstubAllGlobals());
  const info = { host: 'sklep.example', proto: 'https', ip: '', preview: null, cartToken: 'c'.repeat(20), customer: 'k'.repeat(20), orderToken: null, demo: 'VELMIRA' };

  it('reads the example catalogue and never the store\'s carts, accounts or documents', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { urls.push(url); return new Response('{}', { status: 200 }); });
    const api = new Api('http://api', info);
    await api.get('/products?size=4');
    expect(urls).toEqual(['http://api/api/v1/storefront/demo/VELMIRA/products?size=4']);
    await expect(api.get('/account/me')).rejects.toBeInstanceOf(ApiError);
    await expect(api.get('/template')).rejects.toBeInstanceOf(ApiError);
    expect(await api.cart()).toBeNull();
    expect(await api.account()).toBeNull();
    expect(urls).toHaveLength(1);
  });
});

describe('schedules and countdowns (Polish time)', () => {
  it('turn Warsaw local time into the right instant, in winter and in summer', () => {
    expect(new Date(warsawToUtc('2026-12-05T20:00')!).toISOString()).toBe('2026-12-05T19:00:00.000Z');
    expect(new Date(warsawToUtc('2026-07-01T12:00')!).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(new Date(warsawToUtc('2026-03-29T03:30')!).toISOString()).toBe('2026-03-29T01:30:00.000Z'); // just after the switch
    expect(warsawToUtc('5 grudnia')).toBeNull();
  });

  it('show a section only inside its window', () => {
    const now = Date.parse('2026-11-28T12:00:00Z');
    expect(isShown(undefined, now)).toBe(true);
    expect(isShown({ from: '2026-11-27T00:00', to: '2026-12-01T00:00' }, now)).toBe(true);
    expect(isShown({ from: '2026-11-29T00:00' }, now)).toBe(false);
    expect(isShown({ to: '2026-11-28T13:01' }, now)).toBe(true);
    expect(isShown({ to: '2026-11-28T13:00' }, now)).toBe(false); // 13:00 Warsaw = 12:00 UTC: the end is exclusive
  });

  it('give templates the time left and whether it is over', () => {
    const now = Date.parse('2026-12-04T19:00:00Z');
    expect(toTplDate('2026-12-05T21:01', now)).toMatchObject({ past: false, remaining: { d: '01', h: '01', m: '01', s: '00' }, iso: '2026-12-05T20:01:00.000Z' });
    expect(toTplDate('2026-12-01T00:00', now)).toMatchObject({ past: true, remaining: { d: '00', h: '00', m: '00', s: '00' } });
  });

  it('render the shared countdown in every template, hidden when over and set to hide', async () => {
    for (const p of packages.values()) expect(p.sections.has('countdown') && p.sections.has('campaign-banner')).toBe(true);
    const p = packages.get('VELMIRA')!;
    const r = new TemplateRenderer(p, '/_t/v/1');
    const doc = (settings: Record<string, unknown>, schedule?: object) => ({ order: ['cd'], sections: { cd: { type: 'countdown', settings, ...(schedule ? { schedule } : {}) } } });
    const ctx = { pkg: p, api: fakeApi([]), store, pageType: 'index' as const, page: {}, cart: toCart(null), head: '', footer: '' };
    const future = (await r.renderDoc(ctx, doc({ target: '2099-01-01T00:00', heading: 'Drop' }))).get('cd')!;
    expect(future).toContain('data-shop-countdown="2098-12-31T23:00:00.000Z"');
    expect(future).toContain('data-unit="d"');
    const over = await r.renderDoc(ctx, doc({ target: '2020-01-01T00:00', after: 'hide' }));
    expect(over.get('cd')).not.toContain('shop-cd');
    const overMessage = (await r.renderDoc(ctx, doc({ target: '2020-01-01T00:00', ended_heading: 'Już jest!' }))).get('cd')!;
    expect(overMessage).toMatch(/data-shop-countdown-live hidden/);
    expect(overMessage).toContain('Już jest!');
    // scheduled for later: not rendered for customers, shown (and labelled) in the editor
    expect((await r.renderDoc(ctx, doc({ target: '2099-01-01T00:00' }, { from: '2099-01-01T00:00' }))).has('cd')).toBe(false);
    const editing = (await r.renderDoc({ ...ctx, editing: true }, doc({ target: '2099-01-01T00:00' }, { from: '2099-01-01T00:00' }))).get('cd')!;
    expect(editing).toContain('data-shop-scheduled="Teraz ukryta · widoczna od 1 stycznia 2099');
  });
});
