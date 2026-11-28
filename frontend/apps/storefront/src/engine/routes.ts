import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TemplateRenderer, escapeHtml, type RenderContext } from './renderer';
import {
  ApiError, StoreApi, toCart, toProduct, toProductDetail, type ApiCard, type ApiPage, type ApiProduct, type ApiStore, type RequestInfo,
} from './store-data';
import { loadAll, type PageType, type TemplatePackage } from './template-package';

/**
 * Storefront pages of stores whose template is a template package (templates/<name>/): rendered on the server from the
 * designer's HTML. Every other store — and every path not handled here (checkout, account, CMS pages…) — falls through
 * to the Angular storefront.
 */
export const CART_COOKIE = 'shopivo_cart';
export const FAV_COOKIE = 'shopivo_fav';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SORTS = new Set(['PRICE_ASC', 'PRICE_DESC', 'NAME']);
const PAGE_SIZE = 12;

function runtimeSource(): string {
  const candidates = [process.env['SHOPIVO_RUNTIME'], join(process.cwd(), 'apps/storefront/src/engine/runtime/shop.js'),
    join(process.cwd(), 'runtime/shop.js')];
  for (const c of candidates) if (c && existsSync(c)) return readFileSync(c, 'utf8');
  throw new Error('Storefront runtime (shop.js) not found; set SHOPIVO_RUNTIME');
}

export function cookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

interface Route { type: PageType; slug?: string; }

/** Paths this engine renders; null = not ours (Angular handles it). */
export function routeOf(path: string): Route | null {
  if (path === '/') return { type: 'index' };
  if (path === '/produkty' || path === '/szukaj') return { type: 'catalog' };
  if (path === '/koszyk') return { type: 'cart' };
  if (path === '/ulubione') return { type: 'favorites' };
  const m = /^\/(kategoria|produkt)\/([^/]+)$/.exec(path);
  if (m) {
    const slug = decodeURIComponent(m[2]);
    return SLUG.test(slug) ? { type: m[1] === 'kategoria' ? 'catalog' : 'product', slug } : { type: 'not_found' };
  }
  return null;
}

export function templateEngine(apiOrigin: string) {
  const packages = loadAll();
  const renderers = new Map<string, TemplateRenderer>();
  for (const p of packages.values()) renderers.set(p.code, new TemplateRenderer(p, `/_t/${p.code.toLowerCase()}/${p.version}`));
  let runtime: string | null = null;
  const router = express.Router();

  // Template files: versioned URLs, cached for a year. Only files inside the package's assets/ are reachable.
  for (const p of packages.values()) {
    const base = `/_t/${p.code.toLowerCase()}/${p.version}`;
    const css = p.styles.map((f) => readFileSync(join(p.dir, f), 'utf8')).join('\n').replaceAll('{{ASSETS}}', base);
    router.get(`${base}/styles.css`, (_req, res) => {
      res.type('text/css').setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(css);
    });
    router.use(base, express.static(join(p.dir, 'assets'), { maxAge: '1y', immutable: true, index: false, redirect: false, dotfiles: 'deny' }));
  }
  router.get('/_shop/runtime.js', (_req, res) => {
    runtime ??= runtimeSource();
    res.type('text/javascript').setHeader('Cache-Control', 'public, max-age=300');
    res.send(runtime);
  });

  /** The page being rendered: the request itself, or another path of the same store (partial re-renders). */
  interface Target { path: string; query: Record<string, unknown>; }

  function requestInfo(req: express.Request, t: Target): RequestInfo {
    const preview = typeof t.query['podglad'] === 'string' && /^[A-Za-z0-9._-]{10,600}$/.test(t.query['podglad']) ? t.query['podglad'] : null;
    const cart = cookie(req.headers.cookie, CART_COOKIE);
    return { host: req.hostname, proto: req.protocol, ip: req.ip ?? '', preview, cartToken: cart && /^[A-Za-z0-9_-]{16,200}$/.test(cart) ? cart : null };
  }

  /** The store's template, when it is a package this engine has. */
  async function storeFor(api: StoreApi): Promise<{ store: ApiStore; renderer: TemplateRenderer } | null> {
    if (!renderers.size) return null;
    const store = await api.get<ApiStore>('/store');
    const renderer = renderers.get((store.theme?.code ?? '').toUpperCase());
    return renderer ? { store, renderer } : null;
  }

  async function pageData(api: StoreApi, store: ApiStore, route: Route, req: express.Request, t: Target): Promise<{ type: PageType; data: Record<string, unknown>; title: string; status: number }> {
    switch (route.type) {
      case 'catalog': {
        const query = t.query;
        const q = typeof query['q'] === 'string' ? query['q'].trim().slice(0, 100) : '';
        const fromQuery = typeof query['kategoria'] === 'string' && SLUG.test(query['kategoria']) ? query['kategoria'] : '';
        const slug = route.slug ?? fromQuery;
        const category = slug ? store.categories.find((c) => c.slug === slug) : null;
        if (slug && !category) return { type: 'not_found', data: {}, title: 'Nie znaleziono strony', status: 404 };
        const sort = typeof query['sort'] === 'string' && SORTS.has(query['sort']) ? query['sort'] : '';
        const sale = query['promocje'] === 'tak';
        const page = Math.min(500, Math.max(1, Number(query['strona']) || 1));
        const params = new URLSearchParams({ page: String(page - 1), size: String(PAGE_SIZE) });
        if (q) params.set('q', q);
        if (slug) params.set('kategoria', slug);
        if (sort) params.set('sort', sort);
        if (sale) params.set('promocje', 'true');
        const result = await api.get<ApiPage<ApiCard>>('/products?' + params);
        const urlFor = (n: number) => {
          const u = new URLSearchParams();
          if (q) u.set('q', q);
          if (fromQuery && !route.slug) u.set('kategoria', fromQuery);
          if (sort) u.set('sort', sort);
          if (sale) u.set('promocje', 'tak');
          if (n > 1) u.set('strona', String(n));
          const s = u.toString();
          return t.path + (s ? '?' + s : '');
        };
        return {
          type: 'catalog', status: 200,
          title: sale ? 'Promocje' : category?.name ?? (q ? `Wyniki: ${q}` : 'Wszystkie produkty'),
          data: {
            catalog: {
              items: result.items.map(toProduct), total: result.totalItems, page, total_pages: result.totalPages, q, sort, sale,
              category: slug, category_name: category?.name ?? null,
              prev_url: page > 1 ? urlFor(page - 1) : null, next_url: page < result.totalPages ? urlFor(page + 1) : null,
            },
          },
        };
      }
      case 'product': {
        let product: ApiProduct;
        try {
          product = await api.get<ApiProduct>('/products/' + encodeURIComponent(route.slug!));
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return { type: 'not_found', data: {}, title: 'Nie znaleziono produktu', status: 404 };
          throw e;
        }
        const related = await api.optional<ApiCard[]>(`/products/${encodeURIComponent(product.slug)}/similar?limit=4`, []);
        return { type: 'product', status: 200, title: product.seoTitle || product.name, data: { product: toProductDetail(product), related: related.map(toProduct) } };
      }
      case 'favorites': {
        const ids = (cookie(req.headers.cookie, FAV_COOKIE) ?? '').split(',').filter((id) => UUID.test(id)).slice(0, 60);
        const cards = ids.length ? await api.optional<ApiCard[]>('/product-cards?ids=' + ids.join(','), []) : [];
        return { type: 'favorites', status: 200, title: 'Ulubione', data: { favorites: cards.map(toProduct) } };
      }
      case 'cart':
        return { type: 'cart', status: 200, title: 'Koszyk', data: {} };
      case 'not_found':
        return { type: 'not_found', status: 404, title: 'Nie znaleziono strony', data: {} };
      default:
        return { type: 'index', status: 200, title: '', data: {} };
    }
  }

  function head(pkg: TemplatePackage, store: ApiStore, title: string, req: express.Request, noindex: boolean, extra: string): string {
    const base = `/_t/${pkg.code.toLowerCase()}/${pkg.version}`;
    const full = title ? `${title} – ${store.name}` : store.name;
    const canonical = `${req.protocol}://${req.hostname}${req.path}`;
    return [
      `<title>${escapeHtml(full)}</title>`,
      `<link rel="canonical" href="${escapeHtml(canonical)}">`,
      `<meta property="og:title" content="${escapeHtml(full)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(canonical)}">`,
      noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
      `<link rel="stylesheet" href="${base}/styles.css">`,
      extra,
    ].filter(Boolean).join('\n');
  }

  function footer(pkg: TemplatePackage, store: ApiStore): string {
    const base = `/_t/${pkg.code.toLowerCase()}/${pkg.version}`;
    const config = JSON.stringify({ currency: store.currency, cartCookie: CART_COOKIE, favCookie: FAV_COOKIE }).replace(/</g, '\\u003c');
    return [
      `<script type="application/json" id="shop-config">${config}</script>`,
      '<script src="/_shop/runtime.js" defer></script>',
      ...pkg.scripts.map((s) => `<script src="${base}/${encodeURIComponent(s)}" defer></script>`),
    ].join('\n');
  }

  async function context(req: express.Request, route: Route, t: Target = { path: req.path, query: req.query }) {
    const info = requestInfo(req, t);
    const api = new StoreApi(apiOrigin, info);
    const found = await storeFor(api);
    if (!found) return null;
    const { store, renderer } = found;
    if (!store.open && !store.preview) return null; // closed store: the Angular app shows its maintenance page
    const [page, cart] = await Promise.all([pageData(api, store, route, req, t), api.cart()]);
    const ctx: RenderContext = {
      pkg: renderer.pkg, api, store, pageType: page.type, page: page.data, cart: toCart(cart), head: '', footer: '',
    };
    return { ctx, renderer, page, info };
  }

  // Pages
  router.get('/{*path}', (req, res, next) => {
    const route = routeOf(req.path);
    if (!route) return next();
    void (async () => {
      try {
        const c = await context(req, route);
        if (!c) return next();
        const { ctx, renderer, page, info } = c;
        let ld = '';
        if (page.type === 'product') {
          const p = page.data['product'] as ReturnType<typeof toProductDetail>;
          ld = `<script type="application/ld+json">${JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description.slice(0, 5000),
            image: p.images.map((i) => `${req.protocol}://${req.hostname}${i.w1200}`),
            offers: { '@type': 'Offer', priceCurrency: p.currency, price: (p.price / 100).toFixed(2),
              availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
          }).replace(/</g, '\\u003c')}</script>`;
          const desc = (p.seo_description || p.description || p.name).slice(0, 300);
          ld += `\n<meta name="description" content="${escapeHtml(desc)}">`;
        }
        const noindex = !!info.preview || page.status === 404 || (page.type === 'catalog' && !!req.query['q']);
        ctx.head = head(renderer.pkg, ctx.store, page.title, req, noindex, ld);
        ctx.footer = footer(renderer.pkg, ctx.store);
        const html = await renderer.renderPage(ctx);
        res.status(page.status);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', info.preview ? 'private, no-store' : 'private, no-cache');
        if (info.preview) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.send(html);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return next(); // unknown store: Angular shows its own page
        next(e);
      }
    })();
  });

  // Re-rendered sections for the runtime: /_shop/sections?path=/koszyk&ids=main,header
  router.get('/_shop/sections', (req, res, next) => {
    const path = typeof req.query['path'] === 'string' ? req.query['path'] : '';
    const ids = (typeof req.query['ids'] === 'string' ? req.query['ids'] : '').split(',').filter((id) => /^[a-z0-9_-]{1,40}$/i.test(id)).slice(0, 10);
    let url: URL;
    try {
      url = new URL(path, 'http://x');
    } catch {
      res.status(400).end();
      return;
    }
    const route = routeOf(url.pathname);
    if (!route || !ids.length || !path.startsWith('/')) {
      res.status(400).end();
      return;
    }
    void (async () => {
      try {
        const c = await context(req, route, { path: url.pathname, query: Object.fromEntries(url.searchParams) });
        if (!c) {
          res.status(404).end();
          return;
        }
        const out = await c.renderer.renderSections(c.ctx, ids);
        res.setHeader('Cache-Control', 'private, no-store');
        res.json(out);
      } catch (e) {
        next(e);
      }
    })();
  });

  return { router, packages };
}
