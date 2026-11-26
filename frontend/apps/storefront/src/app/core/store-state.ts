import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FONTS, RADII, readableOn } from './format';
import { PublicCategory, PublicStore, StorefrontApi } from '../storefront-api';

/** The store being browsed (loaded once per page load, shared by all pages). */
@Injectable({ providedIn: 'root' })
export class StoreState {
  private readonly api = inject(StorefrontApi);
  readonly store = signal<PublicStore | null>(null);
  readonly status = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  private loading: Promise<void> | null = null;

  readonly settings = computed(() => this.store()?.theme.settings ?? {});
  readonly topCategories = computed(() => (this.store()?.categories ?? []).filter((c) => c.depth === 0));

  /** CSS custom properties of the theme, applied on the root element. */
  readonly cssVars = computed(() => {
    const s = this.settings();
    if (!s['primary']) return '';
    const vars: Record<string, string> = {
      '--sf-primary': s['primary'], '--sf-on-primary': readableOn(s['primary']), '--sf-accent': s['accent'],
      '--sf-bg': s['background'], '--sf-surface': s['surface'], '--sf-text': s['text'],
      '--sf-font': FONTS[s['font']] ?? FONTS['sans'], '--sf-radius': RADII[s['radius']] ?? RADII['soft'],
    };
    return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  });

  load(): Promise<void> {
    this.loading ??= firstValueFrom(this.api.store()).then(
      (store) => {
        this.store.set(store);
        this.status.set('ready');
      },
      (e) => this.status.set(e?.status === 404 ? 'not-found' : 'error'),
    );
    return this.loading;
  }

  children(parentId: string | null): PublicCategory[] {
    return (this.store()?.categories ?? []).filter((c) => c.parentId === parentId);
  }

  category(slug: string): PublicCategory | undefined {
    return this.store()?.categories.find((c) => c.slug === slug);
  }

  /** Path from the root to the category (breadcrumbs). */
  pathTo(slug: string): PublicCategory[] {
    const all = this.store()?.categories ?? [];
    const path: PublicCategory[] = [];
    let current = all.find((c) => c.slug === slug);
    while (current) {
      path.unshift(current);
      current = current.parentId ? all.find((c) => c.id === current!.parentId) : undefined;
    }
    return path;
  }
}
