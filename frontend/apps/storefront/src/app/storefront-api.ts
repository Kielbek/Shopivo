import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ThemeConfig { code: string; settings: Record<string, string>; }
export interface Seller { companyName: string | null; taxId: string | null; address: string | null; email: string | null; phone: string | null; }
export interface PublicCategory { id: string; parentId: string | null; name: string; slug: string; description: string | null; depth: number; seoTitle: string | null; seoDescription: string | null; }
export interface PublicStore {
  name: string; status: 'DRAFT' | 'PUBLISHED' | 'SUSPENDED'; open: boolean; preview: boolean; locale: string; currency: string;
  hostname: string; theme: ThemeConfig; seller: Seller | null; categories: PublicCategory[];
  footerLinks: FooterLink[]; blog: boolean; menu: { label: string; path: string }[]; captchaSiteKey: string | null;
}
export type LegalKey = 'TERMS' | 'PRIVACY' | 'RETURNS' | 'SHIPPING';
export interface FooterLink { title: string; path: string; systemKey: LegalKey | null; }
export interface PublicEntry {
  kind: 'PAGE' | 'POST'; systemKey: LegalKey | null; slug: string; title: string; excerpt: string | null; body: string;
  seoTitle: string | null; seoDescription: string | null; publishedAt: string | null; updatedAt: string; draft: boolean;
}
export interface ReviewSummary { average: number; count: number; distribution: number[]; }
export interface PublicReview { authorName: string; rating: number; body: string | null; createdAt: string; reply: string | null; repliedAt: string | null; }
export interface ProductReviews { summary: ReviewSummary; reviews: Page<PublicReview>; }
export interface ReviewInvitation { orderNumber: number; suggestedAuthor: string; items: { productId: string; name: string; reviewed: boolean }[]; }
export interface PostCard { slug: string; title: string; excerpt: string | null; publishedAt: string; }
export interface ProductCard {
  id: string; slug: string; name: string; brand: string | null; priceMinor: number; maxPriceMinor: number; compareAtMinor: number | null;
  lowestPrice30dMinor: number | null; currency: string; available: boolean; imageUrl: string | null; imageAlt: string | null;
}
export interface Page<T> { items: T[]; page: number; size: number; totalItems: number; totalPages: number; }
export interface ProductImage { id: string; alt: string | null; width: number; height: number; position: number; urls: Record<string, string>; }
export interface PublicVariant {
  id: string; optionValues: Record<string, string>; title: string; sku: string | null; priceMinor: number; compareAtMinor: number | null;
  lowestPrice30dMinor: number | null; available: boolean; lowStock: boolean;
}
export interface PublicProduct {
  id: string; slug: string; name: string; description: string | null; brand: string | null; type: 'PHYSICAL' | 'DIGITAL'; vatRateBps: number;
  currency: string; options: { name: string; values: string[] }[]; variants: PublicVariant[]; images: ProductImage[];
  breadcrumbs: { name: string; slug: string }[]; seoTitle: string | null; seoDescription: string | null; updatedAt: string;
}
export interface CartLine {
  variantId: string; productId: string; name: string; variantTitle: string; sku: string | null; quantity: number; unitPriceMinor: number;
  compareAtMinor: number | null; lineTotalMinor: number; available: boolean; availableQuantity: number | null;
}
export interface Cart { currency: string; lines: CartLine[]; itemCount: number; subtotalMinor: number; checkoutReady: boolean; }
export interface ShippingMethod { id: string; name: string; description: string | null; type: string; priceMinor: number; freeFromMinor: number | null; carrier: string | null; requiresPickupPoint: boolean; }
export interface PickupPointOption { code: string; name: string; address: string; description: string | null; }
export interface PaymentOption { method: 'BANK_TRANSFER' | 'COD' | 'ONLINE'; label: string; feeMinor: number; }
export interface CheckoutOptions { shippingMethods: ShippingMethod[]; paymentMethods: PaymentOption[]; }
export interface Address { name: string; company: string | null; line1: string; line2: string | null; postalCode: string; city: string; countryCode: string; phone: string | null; }
export interface CheckoutInput {
  email: string; phone: string | null; firstName: string; lastName: string; shippingAddress: Address | null;
  billing: { invoice: boolean; companyName: string; taxId: string; address: Address | null } | null; shippingMethodId: string | null;
  paymentMethod: 'BANK_TRANSFER' | 'COD' | 'ONLINE'; customerNote: string | null; termsAccepted: boolean; marketingConsent: boolean;
  pickupPointCode: string | null;
}
export interface CheckoutResult { number: number; orderToken: string; totalMinor: number; currency: string; }
export interface OrderConfirmation {
  number: number; status: string; paymentStatus: string; paymentMethod: string;
  items: { name: string; variantTitle: string | null; quantity: number; lineTotalMinor: number }[];
  subtotalMinor: number; shippingMinor: number; paymentFeeMinor: number; totalMinor: number; currency: string; shippingMethodName: string | null;
  bankTransfer: { bankAccountHolder: string; bankAccountNumber: string; bankName: string | null; unpaidCancelDays: number } | null; createdAt: string;
  pickupPoint: { code: string; address: string } | null;
}

/** Public storefront API. The store is identified by the host — never by an id in the request. */
@Injectable({ providedIn: 'root' })
export class StorefrontApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/storefront';

  store(): Observable<PublicStore> {
    return this.http.get<PublicStore>(`${this.base}/store`);
  }

  products(q: { kategoria?: string; q?: string; sort?: string; page?: number; size?: number }): Observable<Page<ProductCard>> {
    let params = new HttpParams().set('page', q.page ?? 0).set('size', q.size ?? 24);
    if (q.kategoria) params = params.set('kategoria', q.kategoria);
    if (q.q) params = params.set('q', q.q);
    if (q.sort) params = params.set('sort', q.sort);
    return this.http.get<Page<ProductCard>>(`${this.base}/products`, { params });
  }

  product(slug: string): Observable<PublicProduct> {
    return this.http.get<PublicProduct>(`${this.base}/products/${encodeURIComponent(slug)}`);
  }

  page(slug: string): Observable<PublicEntry> {
    return this.http.get<PublicEntry>(`${this.base}/pages/${encodeURIComponent(slug)}`);
  }

  posts(page: number): Observable<Page<PostCard>> {
    return this.http.get<Page<PostCard>>(`${this.base}/posts`, { params: new HttpParams().set('page', page).set('size', 12) });
  }

  post(slug: string): Observable<PublicEntry> {
    return this.http.get<PublicEntry>(`${this.base}/posts/${encodeURIComponent(slug)}`);
  }

  productReviews(slug: string, page: number): Observable<ProductReviews> {
    return this.http.get<ProductReviews>(`${this.base}/products/${encodeURIComponent(slug)}/reviews`, { params: new HttpParams().set('page', page) });
  }

  reviewInvitation(token: string): Observable<ReviewInvitation> {
    return this.http.get<ReviewInvitation>(`${this.base}/review-invitation`, { headers: new HttpHeaders({ 'X-Review-Token': token }) });
  }

  submitReview(token: string, input: { productId: string; rating: number; body: string | null; authorName: string | null }): Observable<void> {
    return this.http.post<void>(`${this.base}/reviews`, input, { headers: new HttpHeaders({ 'X-Review-Token': token }) });
  }

  createCart(): Observable<{ token: string; cart: Cart }> {
    return this.http.post<{ token: string; cart: Cart }>(`${this.base}/cart`, null);
  }

  cart(token: string): Observable<Cart> {
    return this.http.get<Cart>(`${this.base}/cart`, { headers: cartHeader(token) });
  }

  addItem(token: string, variantId: string, quantity: number): Observable<Cart> {
    return this.http.post<Cart>(`${this.base}/cart/items`, { variantId, quantity }, { headers: cartHeader(token) });
  }

  updateItem(token: string, variantId: string, quantity: number): Observable<Cart> {
    return this.http.patch<Cart>(`${this.base}/cart/items/${encodeURIComponent(variantId)}`, { quantity }, { headers: cartHeader(token) });
  }

  checkoutOptions(): Observable<CheckoutOptions> {
    return this.http.get<CheckoutOptions>(`${this.base}/checkout/options`);
  }

  checkout(token: string, input: CheckoutInput, captcha: string | null): Observable<CheckoutResult> {
    let headers = cartHeader(token);
    if (captcha) headers = headers.set('X-Captcha-Token', captcha);
    return this.http.post<CheckoutResult>(`${this.base}/checkout`, input, { headers });
  }

  pickupPoints(methodId: string, q: string): Observable<PickupPointOption[]> {
    return this.http.get<PickupPointOption[]>(`${this.base}/pickup-points`, { params: new HttpParams().set('metoda', methodId).set('q', q) });
  }

  /** Starts (or retries) the online payment; the customer is then sent to the operator's page. */
  payOrder(orderToken: string): Observable<{ redirectUrl: string }> {
    return this.http.post<{ redirectUrl: string }>(`${this.base}/orders/pay`, null, { headers: new HttpHeaders({ 'X-Order-Token': orderToken }) });
  }

  orderStatus(orderToken: string): Observable<OrderConfirmation> {
    return this.http.get<OrderConfirmation>(`${this.base}/orders/status`, { headers: new HttpHeaders({ 'X-Order-Token': orderToken }) });
  }
}

function cartHeader(token: string): HttpHeaders {
  return new HttpHeaders({ 'X-Cart-Token': token });
}
