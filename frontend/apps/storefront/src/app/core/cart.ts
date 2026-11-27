import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Cart, StorefrontApi } from '../storefront-api';
import { TemplateDemo } from './demo';

const KEY = 'shopivo.cart';

/**
 * The visitor's cart. The secret cart token lives in localStorage (browser only; it is per store because each store
 * has its own origin). Prices and availability always come from the server.
 */
@Injectable({ providedIn: 'root' })
export class CartState {
  private readonly api = inject(StorefrontApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly cart = signal<Cart | null>(null);
  readonly busy = signal(false);
  /** Side cart drawer (templates that use one open it after adding a product and from the cart icon). */
  readonly drawer = signal(false);
  readonly count = computed(() => this.cart()?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0);

  private readonly demo = inject(TemplateDemo);

  private token(): string | null {
    // The template preview never touches the visitor's real cart on this host
    if (!this.browser || this.demo.code()) return null;
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  private setToken(token: string | null): void {
    try {
      if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
    } catch {
      // storage unavailable (private mode) — the cart lives for this page only
    }
  }

  async refresh(): Promise<void> {
    const token = this.token();
    if (!token) return;
    try {
      this.cart.set(await firstValueFrom(this.api.cart(token)));
    } catch (e: unknown) {
      if ((e as { status?: number }).status === 404) {
        this.setToken(null);
        this.cart.set(null);
      }
    }
  }

  async add(variantId: string, quantity: number): Promise<void> {
    this.busy.set(true);
    try {
      // A stored token may point to a cart already turned into an order (e.g. in another tab) — check it first.
      if (this.token() && !this.cart()) await this.refresh();
      let token = this.token();
      if (!token) {
        const created = await firstValueFrom(this.api.createCart());
        token = created.token;
        this.setToken(token);
      }
      this.cart.set(await firstValueFrom(this.api.addItem(token, variantId, quantity)));
    } finally {
      this.busy.set(false);
    }
  }

  async update(variantId: string, quantity: number): Promise<void> {
    const token = this.token();
    if (!token) return;
    this.busy.set(true);
    try {
      this.cart.set(await firstValueFrom(this.api.updateItem(token, variantId, quantity)));
    } finally {
      this.busy.set(false);
    }
  }

  currentToken(): string | null {
    return this.token();
  }

  /** After a successful checkout the cart no longer exists on the server. */
  clear(): void {
    this.setToken(null);
    this.cart.set(null);
  }
}
