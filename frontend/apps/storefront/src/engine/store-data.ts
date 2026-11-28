/**
 * Server-side access to the storefront API for one request (the visitor's host identifies the store) and the shapes
 * templates see. Templates never get raw API objects: everything goes through the `to*` functions below, so the
 * template contract (docs/TEMPLATE_FORMAT.md) stays stable when the API changes.
 */
export interface RequestInfo {
  host: string;
  proto: string;
  ip: string;
  preview: string | null;
  cartToken: string | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, path: string) {
    super(`${status} ${path}`);
  }
}

export class StoreApi {
  constructor(private readonly origin: string, private readonly req: RequestInfo) {}

  async get<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json', 'x-forwarded-host': this.req.host, 'x-forwarded-proto': this.req.proto,
      'x-forwarded-for': this.req.ip, ...extra,
    };
    if (this.req.preview) headers['x-store-preview'] = this.req.preview;
    const res = await fetch(this.origin + '/api/v1/storefront' + path, { headers, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new ApiError(res.status, path);
    return (await res.json()) as T;
  }

  /** Like get, but a failure gives the fallback (optional page parts must not break the page). */
  async optional<T>(path: string, fallback: T, extra: Record<string, string> = {}): Promise<T> {
    try {
      return await this.get<T>(path, extra);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) console.warn('Storefront API', (e as Error).message);
      return fallback;
    }
  }

  cart(): Promise<ApiCart | null> {
    return this.req.cartToken ? this.optional<ApiCart | null>('/cart', null, { 'x-cart-token': this.req.cartToken }) : Promise.resolve(null);
  }
}

// ------------------------------------------------------------------------------------------------- API shapes

export interface ApiCategory { id: string; parentId: string | null; name: string; slug: string; depth: number; image: Record<string, string> | null; }
export interface ApiStore {
  name: string; status: string; open: boolean; preview: boolean; currency: string; hostname: string;
  theme: { code: string; settings: Record<string, string> };
  categories: ApiCategory[];
  footerLinks: { title: string; path: string; systemKey: string | null }[];
  themeImages: Record<string, Record<string, string>>;
  panelOrigin: string | null;
}
export interface ApiCard {
  id: string; slug: string; name: string; brand: string | null; priceMinor: number; maxPriceMinor: number; compareAtMinor: number | null;
  lowestPrice30dMinor: number | null; currency: string; available: boolean; imageUrl: string | null; imageAlt: string | null; imageColor?: string | null;
}
export interface ApiPage<T> { items: T[]; page: number; size: number; totalItems: number; totalPages: number; }
export interface ApiProduct {
  id: string; slug: string; name: string; description: string | null; brand: string | null; currency: string;
  variants: { id: string; title: string; sku: string | null; priceMinor: number; compareAtMinor: number | null; lowestPrice30dMinor: number | null; available: boolean }[];
  images: { alt: string | null; width: number; height: number; urls: Record<string, string>; color?: string | null }[];
  breadcrumbs: { name: string; slug: string }[];
  seoTitle: string | null; seoDescription: string | null;
}
export interface ApiCart {
  currency: string; itemCount: number; subtotalMinor: number; checkoutReady: boolean;
  lines: { variantId: string; productId: string; productSlug?: string | null; name: string; variantTitle: string; quantity: number;
    unitPriceMinor: number; lineTotalMinor: number; available: boolean; imageUrl?: string | null; imageColor?: string | null }[];
}

// ------------------------------------------------------------------------------------------------- template shapes

export interface TplImage { w400: string; w1200: string; alt?: string; width?: number; height?: number; asset?: boolean; }

export interface TplProduct {
  id: string; slug: string; url: string; name: string; brand: string | null; price: number; has_range: boolean;
  compare_at: number | null; on_sale: boolean; discount: number; lowest_30d: number | null; currency: string;
  available: boolean; image: TplImage | null; color: string | null;
}

function variantUrl(url: string, from: string, to: string): string {
  return url.replace(new RegExp(`/${from}\\.(jpg|png)$`), `/${to}.$1`);
}

export function toProduct(c: ApiCard): TplProduct {
  const onSale = !!c.compareAtMinor && c.compareAtMinor > c.priceMinor;
  return {
    id: c.id, slug: c.slug, url: '/produkt/' + encodeURIComponent(c.slug), name: c.name, brand: c.brand,
    price: c.priceMinor, has_range: c.maxPriceMinor > c.priceMinor, compare_at: onSale ? c.compareAtMinor : null, on_sale: onSale,
    discount: onSale ? Math.round((1 - c.priceMinor / c.compareAtMinor!) * 100) : 0, lowest_30d: onSale ? c.lowestPrice30dMinor : null,
    currency: c.currency, available: c.available,
    image: c.imageUrl ? { w400: c.imageUrl, w1200: variantUrl(c.imageUrl, 'w400', 'w1200'), alt: c.imageAlt ?? c.name } : null,
    color: c.imageColor ?? null,
  };
}

export function toProductDetail(p: ApiProduct) {
  const cheapest = [...p.variants].sort((a, b) => a.priceMinor - b.priceMinor)[0];
  const max = Math.max(...p.variants.map((v) => v.priceMinor));
  const onSale = !!cheapest?.compareAtMinor && cheapest.compareAtMinor > cheapest.priceMinor;
  const img = p.images[0];
  return {
    id: p.id, slug: p.slug, url: '/produkt/' + encodeURIComponent(p.slug), name: p.name, brand: p.brand,
    description: p.description ?? '', currency: p.currency,
    price: cheapest?.priceMinor ?? 0, has_range: max > (cheapest?.priceMinor ?? 0),
    compare_at: onSale ? cheapest.compareAtMinor : null, on_sale: onSale,
    discount: onSale ? Math.round((1 - cheapest.priceMinor / cheapest.compareAtMinor!) * 100) : 0,
    lowest_30d: onSale ? cheapest.lowestPrice30dMinor : null,
    available: p.variants.some((v) => v.available),
    image: img ? { w400: img.urls['w400'], w1200: img.urls['w1200'], alt: img.alt ?? p.name, width: img.width, height: img.height } : null,
    images: p.images.map((i) => ({ w400: i.urls['w400'], w1200: i.urls['w1200'], alt: i.alt ?? p.name, width: i.width, height: i.height })),
    color: img?.color ?? null,
    variants: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku, price: v.priceMinor, compare_at: v.compareAtMinor, available: v.available })),
    breadcrumbs: p.breadcrumbs,
    category_name: p.breadcrumbs.at(-1)?.name ?? null,
    seo_title: p.seoTitle, seo_description: p.seoDescription,
  };
}

export function toCart(c: ApiCart | null) {
  if (!c) return { lines: [], item_count: 0, subtotal: 0, currency: 'PLN', checkout_ready: false };
  return {
    currency: c.currency, item_count: c.itemCount, subtotal: c.subtotalMinor, checkout_ready: c.checkoutReady,
    lines: c.lines.map((l) => ({
      variant_id: l.variantId, product_id: l.productId, name: l.name, variant_title: l.variantTitle, quantity: l.quantity,
      unit_price: l.unitPriceMinor, line_total: l.lineTotalMinor, available: l.available,
      url: l.productSlug ? '/produkt/' + encodeURIComponent(l.productSlug) : '/produkty',
      image: l.imageUrl ? { w400: l.imageUrl, w1200: variantUrl(l.imageUrl, 'w400', 'w1200'), alt: l.name } : null,
      color: l.imageColor ?? null,
    })),
  };
}

export function toCategory(c: ApiCategory) {
  return {
    id: c.id, name: c.name, slug: c.slug, url: '/kategoria/' + encodeURIComponent(c.slug), depth: c.depth,
    image: c.image ? { w400: c.image['w400'], w1200: c.image['w1200'], alt: c.name } : null,
  };
}
