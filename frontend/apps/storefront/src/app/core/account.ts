import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Address } from '../storefront-api';

export interface CustomerAccount { id: string; email: string; firstName: string; lastName: string; phone: string | null; emailVerified: boolean; createdAt: string; }
export interface SavedAddress {
  id: string; name: string; company: string | null; line1: string; line2: string | null; postalCode: string; city: string;
  countryCode: string; phone: string | null; isDefault: boolean;
}
export interface CustomerOrder {
  number: number; createdAt: string; status: string; paymentStatus: string; paymentMethod: string; totalMinor: number; currency: string;
  shippingMethodName: string | null; trackingNumber: string | null; shippingAddress: Address | null; subtotalMinor: number; shippingMinor: number;
  paymentFeeMinor: number; items: { productId: string | null; name: string; variantTitle: string | null; quantity: number; lineTotalMinor: number }[];
}
export interface Reviewable { orderNumber: number; productId: string; name: string; completedAt: string | null; }

const BASE = '/api/v1/storefront/account';

/**
 * Every account request carries `X-Requested-With: shopivo` (CSRF protection on the API side). The session itself is an
 * HttpOnly cookie that scripts cannot read.
 */
export const accountInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.includes(BASE) || req.url.includes('/api/v1/storefront/newsletter') ? next(req.clone({ setHeaders: { 'X-Requested-With': 'shopivo' } })) : next(req);

/** The signed-in customer of this store (browser only). */
@Injectable({ providedIn: 'root' })
export class CustomerSession {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly account = signal<CustomerAccount | null>(null);
  readonly ready = signal(false);
  private loading: Promise<void> | null = null;

  /** Loads the session once (subsequent calls reuse it). */
  load(): Promise<void> {
    if (!this.browser) return Promise.resolve();
    this.loading ??= firstValueFrom(this.http.get<CustomerAccount | null>(`${BASE}/me`))
      .then((a) => this.account.set(a ?? null))
      .catch(() => this.account.set(null))
      .finally(() => this.ready.set(true));
    return this.loading;
  }

  async login(email: string, password: string): Promise<void> {
    this.account.set(await firstValueFrom(this.http.post<CustomerAccount>(`${BASE}/login`, { email, password })));
  }

  async verify(token: string, password: string): Promise<void> {
    this.account.set(await firstValueFrom(this.http.post<CustomerAccount>(`${BASE}/verify`, { token, password })));
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${BASE}/logout`, null));
    } finally {
      this.account.set(null);
    }
  }

  /** Called when the API says the session is gone (e.g. expired or signed out elsewhere). */
  signedOut(): void {
    this.account.set(null);
  }

  register(input: { email: string; password: string; firstName: string; lastName: string; termsAccepted: boolean }, captcha: string | null): Observable<void> {
    return this.http.post<void>(`${BASE}/register`, input, { headers: captchaHeader(captcha) });
  }

  requestReset(email: string, captcha: string | null): Observable<void> {
    return this.http.post<void>(`${BASE}/password-reset`, { email }, { headers: captchaHeader(captcha) });
  }

  confirmReset(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${BASE}/password-reset/confirm`, { token, password });
  }

  updateProfile(input: { firstName: string; lastName: string; phone: string | null }): Observable<CustomerAccount> {
    return this.http.patch<CustomerAccount>(`${BASE}/me`, input);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${BASE}/password`, { currentPassword, newPassword });
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.post<void>(`${BASE}/delete`, { password });
  }

  orders(): Observable<CustomerOrder[]> {
    return this.http.get<CustomerOrder[]>(`${BASE}/orders`);
  }

  order(number: number): Observable<CustomerOrder> {
    return this.http.get<CustomerOrder>(`${BASE}/orders/${number}`);
  }

  addresses(): Observable<SavedAddress[]> {
    return this.http.get<SavedAddress[]>(`${BASE}/addresses`);
  }

  saveAddress(address: Omit<SavedAddress, 'id'>, id: string | null): Observable<SavedAddress[]> {
    return id ? this.http.put<SavedAddress[]>(`${BASE}/addresses/${id}`, address) : this.http.post<SavedAddress[]>(`${BASE}/addresses`, address);
  }

  deleteAddress(id: string): Observable<SavedAddress[]> {
    return this.http.delete<SavedAddress[]>(`${BASE}/addresses/${id}`);
  }

  payOrder(number: number): Observable<{ redirectUrl: string }> {
    return this.http.post<{ redirectUrl: string }>(`${BASE}/orders/${number}/pay`, null);
  }

  reviewable(): Observable<Reviewable[]> {
    return this.http.get<Reviewable[]>(`${BASE}/reviews/pending`);
  }

  review(input: { orderNumber: number; productId: string; rating: number; body: string | null; authorName: string | null }): Observable<void> {
    return this.http.post<void>(`${BASE}/reviews`, input);
  }
}

function captchaHeader(token: string | null): Record<string, string> {
  return token ? { 'X-Captcha-Token': token } : {};
}

/** Polish message from an API error (Problem Details `detail`). */
export function apiMessage(e: unknown, fallback = 'Coś poszło nie tak. Spróbuj ponownie.'): string {
  const detail = (e as HttpErrorResponse)?.error?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

export function apiCode(e: unknown): string | null {
  const code = (e as HttpErrorResponse)?.error?.code;
  return typeof code === 'string' ? code : null;
}
