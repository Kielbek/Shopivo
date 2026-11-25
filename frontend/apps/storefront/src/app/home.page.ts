import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { PublicStore, StorefrontApi } from './storefront-api';

/**
 * Phase 1 storefront: resolves the store by hostname and renders its state. The catalogue, themes and SEO
 * features are delivered in phase 4 (docs/IMPLEMENTATION_ROADMAP.md).
 */
@Component({
  selector: 'sf-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-center justify-center px-6">
      @switch (state()) {
        @case ('ready') {
          <div class="max-w-md text-center">
            <h1 class="text-3xl font-semibold tracking-tight">{{ store()?.name }}</h1>
            @if (store()?.status !== 'PUBLISHED') {
              <p class="mt-3 text-zinc-600">Sklep jest w przygotowaniu. Zajrzyj tu wkrótce.</p>
            }
          </div>
        }
        @case ('not-found') {
          <div class="max-w-md text-center">
            <h1 class="text-2xl font-semibold">Nie znaleziono sklepu</h1>
            <p class="mt-3 text-zinc-600">Pod tym adresem nie działa żaden sklep.</p>
          </div>
        }
        @case ('error') {
          <div class="max-w-md text-center">
            <h1 class="text-2xl font-semibold">Sklep jest chwilowo niedostępny</h1>
            <p class="mt-3 text-zinc-600">Spróbuj ponownie za kilka minut.</p>
          </div>
        }
      }
    </main>
  `,
})
export class HomePage {
  private readonly api = inject(StorefrontApi);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly response = inject(RESPONSE_INIT, { optional: true });

  protected readonly store = signal<PublicStore | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const store = await firstValueFrom(this.api.store());
      this.store.set(store);
      this.title.setTitle(store.name);
      if (store.status !== 'PUBLISHED') {
        this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
      }
      this.state.set('ready');
    } catch (e) {
      const notFound = e instanceof HttpErrorResponse && e.status === 404;
      this.state.set(notFound ? 'not-found' : 'error');
      this.title.setTitle(notFound ? 'Nie znaleziono sklepu' : 'Sklep chwilowo niedostępny');
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
      if (this.response) {
        this.response.status = notFound ? 404 : 503;
      }
    }
  }
}
