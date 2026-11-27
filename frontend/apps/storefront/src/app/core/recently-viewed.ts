import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

const KEY = 'sf-recent';
const MAX = 12;

/** Products this browser looked at recently (kept only on the device, never sent anywhere but as a list of ids). */
@Injectable({ providedIn: 'root' })
export class RecentlyViewed {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly ids = signal<string[]>([]);

  constructor() {
    if (!this.browser) return;
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      this.ids.set(Array.isArray(v) ? v.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX) : []);
    } catch {
      this.ids.set([]);
    }
  }

  add(id: string): void {
    if (!this.browser) return;
    const next = [id, ...this.ids().filter((x) => x !== id)].slice(0, MAX);
    this.ids.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage unavailable
    }
  }
}
