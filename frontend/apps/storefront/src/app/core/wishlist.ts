import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CustomerSession } from './account';

const KEY = 'sf-wishlist';
const MAX = 200;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(KEY, JSON.stringify(ids)); else localStorage.removeItem(KEY);
  } catch {
    // storage blocked (private mode) — favourites last for this visit only
  }
}

/**
 * Favourite products. Guests keep them in this browser; a signed-in customer keeps them in the account — favourites
 * gathered before signing in are moved into the account.
 */
@Injectable({ providedIn: 'root' })
export class Wishlist {
  private readonly session = inject(CustomerSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly ids = signal<string[]>([]);
  readonly error = signal<string | null>(null);
  private syncedFor: string | null | undefined;

  constructor() {
    if (!this.browser) return;
    this.ids.set(read());
    effect(() => {
      if (!this.session.ready()) return;
      const account = this.session.account();
      if (account?.id === this.syncedFor) return;
      this.syncedFor = account?.id ?? null;
      void (account ? this.syncAccount() : Promise.resolve(this.ids.set(read())));
    });
  }

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  async toggle(id: string): Promise<void> {
    const adding = !this.has(id);
    const before = this.ids();
    this.ids.set(adding ? [id, ...before].slice(0, MAX) : before.filter((x) => x !== id));
    this.error.set(null);
    if (!this.session.account()) {
      write(this.ids());
      return;
    }
    try {
      this.ids.set(await firstValueFrom(adding ? this.session.addToWishlist([id]) : this.session.removeFromWishlist(id)));
    } catch {
      this.ids.set(before);
      this.error.set('Nie udało się zapisać ulubionych. Spróbuj ponownie.');
    }
  }

  private async syncAccount(): Promise<void> {
    const local = read();
    try {
      this.ids.set(await firstValueFrom(local.length ? this.session.addToWishlist(local) : this.session.wishlist()));
      write([]);
    } catch {
      this.ids.set(local);
    }
  }
}
