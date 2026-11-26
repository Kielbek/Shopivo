import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CartState } from './core/cart';
import { StoreState } from './core/store-state';

@Component({
  selector: 'sf-root',
  imports: [RouterOutlet, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.style]': 'store.cssVars()', class: 'flex min-h-dvh flex-col bg-sf-bg text-sf-text font-[family-name:var(--sf-font)]' },
  template: `
    @switch (store.status()) {
      @case ('loading') {
        <main class="flex flex-1 items-center justify-center"><span class="text-sf-muted">Wczytywanie…</span></main>
      }
      @case ('not-found') {
        <main class="flex flex-1 items-center justify-center px-6 text-center">
          <div><h1 class="text-2xl font-semibold">Nie znaleziono sklepu</h1>
            <p class="mt-3 text-sf-muted">Sprawdź adres strony.</p></div>
        </main>
      }
      @case ('error') {
        <main class="flex flex-1 items-center justify-center px-6 text-center">
          <div><h1 class="text-2xl font-semibold">Sklep jest chwilowo niedostępny</h1>
            <p class="mt-3 text-sf-muted">Spróbuj ponownie za kilka minut.</p></div>
        </main>
      }
      @default {
        @let s = store.store()!;
        @if (!s.open) {
          <main class="flex flex-1 items-center justify-center px-6 text-center">
            <div class="max-w-md">
              <h1 class="text-3xl font-semibold tracking-tight">{{ s.name }}</h1>
              <p class="mt-3 text-sf-muted">Sklep jest w przygotowaniu. Zajrzyj tu wkrótce.</p>
            </div>
          </main>
        } @else {
          <a href="#tresc" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-sf-surface focus:px-3 focus:py-2">Przejdź do treści</a>
          @if (s.preview) {
            <div class="bg-[#111] px-4 py-2 text-center text-[13px] text-white" role="status">Podgląd sklepu — zmiany w szkicu widzisz tylko Ty (link ważny 2 godziny).</div>
          }
          @if (store.settings()['announcement']) {
            <div class="px-4 py-2 text-center text-[13px] font-medium" style="background: var(--sf-accent); color: var(--sf-text)">
              {{ store.settings()['announcement'] }}
            </div>
          }
          <header class="sticky top-0 z-30 border-b border-sf-line bg-sf-bg/95 backdrop-blur">
            <div class="sf-container flex h-16 items-center gap-4">
              <button type="button" class="-ml-2 flex size-10 items-center justify-center lg:hidden" aria-label="Menu" [attr.aria-expanded]="menu()"
                (click)="menu.set(!menu())">
                <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
              </button>
              <a routerLink="/" class="truncate text-[20px] font-semibold tracking-tight">{{ s.name }}</a>
              <nav class="ml-6 hidden items-center gap-6 lg:flex" aria-label="Kategorie">
                @for (c of store.topCategories().slice(0, 6); track c.id) {
                  <a [routerLink]="['/kategoria', c.slug]" class="text-[14px] font-medium hover:underline">{{ c.name }}</a>
                }
              </nav>
              <form class="ml-auto hidden md:block" role="search" (ngSubmit)="search()">
                <label class="sr-only" for="sf-search">Szukaj produktów</label>
                <input id="sf-search" name="q" type="search" class="sf-input !h-10 w-56" placeholder="Szukaj produktów…" [(ngModel)]="query" />
              </form>
              <a routerLink="/koszyk" class="relative ml-auto flex size-10 items-center justify-center md:ml-0" [attr.aria-label]="'Koszyk, produktów: ' + cart.count()">
                <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
                @if (cart.count() > 0) {
                  <span class="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-sf-primary px-1 text-[11px] font-bold text-sf-on-primary">{{ cart.count() }}</span>
                }
              </a>
            </div>
            @if (menu()) {
              <div class="border-t border-sf-line lg:hidden">
                <div class="sf-container py-3">
                  <form class="mb-3 md:hidden" role="search" (ngSubmit)="search()">
                    <label class="sr-only" for="sf-search-m">Szukaj produktów</label>
                    <input id="sf-search-m" name="qm" type="search" class="sf-input" placeholder="Szukaj produktów…" [(ngModel)]="query" />
                  </form>
                  <nav aria-label="Kategorie" class="flex flex-col">
                    <a routerLink="/produkty" class="py-2.5 font-medium">Wszystkie produkty</a>
                    @for (c of store.topCategories(); track c.id) {
                      <a [routerLink]="['/kategoria', c.slug]" class="py-2.5 font-medium">{{ c.name }}</a>
                    }
                  </nav>
                </div>
              </div>
            }
          </header>

          <main id="tresc" class="flex-1"><router-outlet /></main>

          <footer class="mt-16 border-t border-sf-line bg-sf-surface">
            <div class="sf-container grid gap-8 py-10 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
              <div class="lg:col-span-2">
                <p class="text-[17px] font-semibold">{{ s.name }}</p>
                @if (store.settings()['footerNote']) {<p class="mt-2 max-w-md text-sf-muted">{{ store.settings()['footerNote'] }}</p>}
              </div>
              <div>
                <p class="font-semibold">Kategorie</p>
                <ul class="mt-2 space-y-1.5 text-sf-muted">
                  @for (c of store.topCategories().slice(0, 8); track c.id) {
                    <li><a [routerLink]="['/kategoria', c.slug]" class="hover:underline">{{ c.name }}</a></li>
                  }
                </ul>
              </div>
              <div>
                <p class="font-semibold">Sprzedawca</p>
                <address class="mt-2 space-y-1 not-italic text-sf-muted">
                  @if (s.seller.companyName) {<p>{{ s.seller.companyName }}</p>}
                  @if (s.seller.address) {<p>{{ s.seller.address }}</p>}
                  @if (s.seller.taxId) {<p>NIP {{ s.seller.taxId }}</p>}
                  @if (s.seller.email) {<p><a class="hover:underline" [href]="'mailto:' + s.seller.email">{{ s.seller.email }}</a></p>}
                  @if (s.seller.phone) {<p><a class="hover:underline" [href]="'tel:' + s.seller.phone">{{ s.seller.phone }}</a></p>}
                </address>
              </div>
            </div>
            <div class="border-t border-sf-line py-4 text-center text-[12px] text-sf-muted">© {{ year }} {{ s.name }} · Sklep działa na platformie Shopivo</div>
          </footer>
        }
      }
    }
  `,
})
export class App {
  protected readonly store = inject(StoreState);
  protected readonly cart = inject(CartState);
  private readonly router = inject(Router);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  protected readonly menu = signal(false);
  protected readonly year = new Date().getFullYear();
  protected query = '';

  constructor() {
    void this.store.load().then(() => {
      const st = this.store.status();
      const s = this.store.store();
      if (st !== 'ready' || !s?.open) {
        // Unknown store → 404, backend down → 503, unpublished → visible but never indexed.
        if (this.response) this.response.status = st === 'not-found' ? 404 : st === 'error' ? 503 : 200;
        this.title.setTitle(s?.name ?? (st === 'not-found' ? 'Nie znaleziono sklepu' : 'Sklep chwilowo niedostępny'));
        this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
      } else {
        void this.cart.refresh();
      }
    });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menu.set(false));
  }

  protected search(): void {
    const q = this.query.trim();
    if (q) void this.router.navigate(['/szukaj'], { queryParams: { q } });
  }
}
