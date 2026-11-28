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
  /** Customer session cookie (HttpOnly; forwarded only to the account API). */
  customer: string | null;
  /** Token of the visitor's last order (confirmation page). */
  orderToken: string | null;
  /** Template preview (`?szablon=CODE`): the template's example catalogue instead of the store's data. */
  demo?: string | null;
}

/** What a template preview never reads: the store's own carts, orders, accounts, documents and redirects. */
const NOT_IN_DEMO = /^\/(account|cart|checkout|orders|returns|template|redirect|pages|posts\/)/;

export class ApiError extends Error {
  constructor(readonly status: number, path: string) {
    super(`${status} ${path}`);
  }
}

export class StoreApi {
  constructor(private readonly origin: string, private readonly req: RequestInfo) {}

  async get<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
    if (this.req.demo) {
      if (NOT_IN_DEMO.test(path)) throw new ApiError(404, path);
      path = `/demo/${this.req.demo}${path}`;
    }
    const headers: Record<string, string> = {
      accept: 'application/json', 'x-forwarded-host': this.req.host, 'x-forwarded-proto': this.req.proto,
      'x-forwarded-for': this.req.ip, ...extra,
    };
    if (this.req.preview) headers['x-store-preview'] = this.req.preview;
    if (path.startsWith('/account/')) {
      headers['x-requested-with'] = 'shopivo'; // the API's CSRF check for account requests
      if (this.req.customer) headers['cookie'] = `shopivo_customer=${this.req.customer}`;
    }
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

  /** The signed-in customer, or null for guests. */
  account(): Promise<ApiAccount | null> {
    return this.req.customer && !this.req.demo ? this.optional<ApiAccount | null>('/account/me', null) : Promise.resolve(null);
  }

  order(): Promise<ApiOrder | null> {
    return this.req.orderToken && !this.req.demo ? this.optional<ApiOrder | null>('/orders/status', null, { 'x-order-token': this.req.orderToken }) : Promise.resolve(null);
  }

  cart(): Promise<ApiCart | null> {
    return this.req.cartToken && !this.req.demo ? this.optional<ApiCart | null>('/cart', null, { 'x-cart-token': this.req.cartToken }) : Promise.resolve(null);
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
  captchaSiteKey?: string | null;
  /** The store has its own Google OAuth keys and sign-in with Google is on. */
  googleSignIn?: boolean;
  blog?: boolean;
}
export interface ApiAccount { email: string; firstName: string; lastName: string; phone: string | null; }
export interface ApiAccountFull extends ApiAccount { id: string; emailVerified: boolean; }
export interface ApiSavedAddress { id: string; name: string; company: string | null; line1: string; line2: string | null; postalCode: string; city: string; phone: string | null; isDefault: boolean; }
export interface ApiCustomerOrder {
  number: number; createdAt: string; status: string; paymentStatus: string; paymentMethod: string; totalMinor: number; currency: string;
  shippingMethodName: string | null; trackingNumber: string | null; subtotalMinor: number; shippingMinor: number; paymentFeeMinor: number;
  shippingAddress: { name: string; line1: string; line2: string | null; postalCode: string; city: string } | null;
  items: { id: string; name: string; variantTitle: string | null; quantity: number; lineTotalMinor: number }[];
}
export interface ApiReturn {
  number: number; orderNumber: number; kind: 'WITHDRAWAL' | 'COMPLAINT'; status: string; merchantNote: string | null; createdAt: string;
  items: { name: string; quantity: number }[];
}
export interface ApiAddress { line1: string; line2: string | null; postalCode: string; city: string; isDefault: boolean; }
export interface ApiCheckoutOptions {
  shippingMethods: { id: string; name: string; description: string | null; type: string; priceMinor: number; freeFromMinor: number | null; requiresPickupPoint: boolean }[];
  paymentMethods: { method: 'BANK_TRANSFER' | 'COD' | 'ONLINE'; label: string; feeMinor: number }[];
}
export interface ApiOrder {
  number: number; status: string; paymentStatus: string; paymentMethod: string;
  items: { name: string; variantTitle: string | null; quantity: number; lineTotalMinor: number }[];
  subtotalMinor: number; shippingMinor: number; paymentFeeMinor: number; totalMinor: number; currency: string; shippingMethodName: string | null;
  bankTransfer: { bankAccountHolder: string; bankAccountNumber: string; bankName: string | null; unpaidCancelDays: number } | null;
  pickupPoint: { code: string; address: string } | null;
}
export interface ApiEntry {
  kind: 'PAGE' | 'POST'; systemKey: string | null; slug: string; title: string; excerpt: string | null; body: string;
  seoTitle: string | null; seoDescription: string | null; publishedAt: string | null; updatedAt: string;
}
export interface ApiPostCard { slug: string; title: string; excerpt: string | null; publishedAt: string; }
export interface ApiCard {
  id: string; slug: string; name: string; brand: string | null; priceMinor: number; maxPriceMinor: number; compareAtMinor: number | null;
  lowestPrice30dMinor: number | null; currency: string; available: boolean; imageUrl: string | null; imageAlt: string | null; imageColor?: string | null; summary?: string | null;
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
  available: boolean; image: TplImage | null; color: string | null; summary: string | null;
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
    color: c.imageColor ?? null, summary: c.summary ?? null,
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

export function toCheckout(o: ApiCheckoutOptions) {
  return {
    shipping_methods: o.shippingMethods.map((m) => ({
      id: m.id, name: m.name, description: m.description, price: m.priceMinor, free_from: m.freeFromMinor, pickup_point: m.requiresPickupPoint,
    })),
    payment_methods: o.paymentMethods.map((p) => ({ method: p.method, label: p.label, fee: p.feeMinor })),
  };
}

/** IBAN-style groups of four for reading a bank account number aloud. */
export function groupAccount(n: string): string {
  const m = /^([A-Z]{2})?(\d{26})$/.exec(n.replace(/\s/g, ''));
  if (!m) return n;
  return (m[1] ?? '') + m[2].slice(0, 2) + ' ' + m[2].slice(2).replace(/(.{4})/g, '$1 ').trim();
}

export function toOrder(o: ApiOrder) {
  return {
    number: o.number, status: o.status, payment_status: o.paymentStatus, payment_method: o.paymentMethod,
    paid: o.paymentStatus === 'PAID', canceled: o.status === 'CANCELED',
    awaiting_online: o.paymentMethod === 'ONLINE' && o.paymentStatus === 'UNPAID' && o.status !== 'CANCELED',
    items: o.items.map((i) => ({ name: i.name, variant_title: i.variantTitle, quantity: i.quantity, line_total: i.lineTotalMinor })),
    subtotal: o.subtotalMinor, shipping: o.shippingMinor, payment_fee: o.paymentFeeMinor, total: o.totalMinor, currency: o.currency,
    shipping_method: o.shippingMethodName,
    bank_transfer: o.bankTransfer ? { holder: o.bankTransfer.bankAccountHolder, account: groupAccount(o.bankTransfer.bankAccountNumber),
      bank: o.bankTransfer.bankName, cancel_days: o.bankTransfer.unpaidCancelDays } : null,
    pickup_point: o.pickupPoint,
  };
}
