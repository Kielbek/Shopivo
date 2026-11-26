import { ChangeDetectionStrategy, Component, RESPONSE_INIT, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CartState } from './core/cart';
import { CustomerSession } from './core/account';
import { routeOf } from './core/link-token';
import { StoreState } from './core/store-state';
import { SectionNewsletterCompactComponent } from './ui/sections';

const SOCIALS = [
  { key: 'instagram', label: 'Instagram', icon: 'M4 4h16v16H4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 6.5h.01' },
  { key: 'facebook', label: 'Facebook', icon: 'M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z' },
  { key: 'tiktok', label: 'TikTok', icon: 'M14 4v10a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.5 2.5 4 5 4' },
  { key: 'youtube', label: 'YouTube', icon: 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8ZM10 9l5 3-5 3V9Z' },
];

@Component({
  selector: 'sf-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, NgTemplateOutlet, SectionNewsletterCompactComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.style]': 'store.cssVars()', class: 'flex min-h-dvh flex-col bg-sf-bg text-sf-text font-[family-name:var(--sf-font)]' },
  template: `
    @switch (store.status()) {
      @case ('loading') {
        <main class="mx-auto w-full max-w-6xl flex-1 px-5 py-6" role="status" aria-busy="true"><span class="sr-only">Wczytywanie…</span><span class="sf-shimmer block h-10 w-40 rounded-[8px]"></span><span class="sf-shimmer mt-8 block h-64 rounded-[14px]"></span><span class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">@for (i of [0, 1, 2, 3]; track i) {<span class="sf-shimmer block aspect-[4/5] rounded-[12px]"></span>}</span></main>
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
          @let ts = store.settings();
          @let logo = store.image(ts['logoImage'], 'w400');
          @let centered = ts['headerStyle'] === 'centered';
          @let bottomNav = ts['mobileNav'] === 'bottom';
          <ng-template #brand>
            <a routerLink="/" class="flex min-w-0 items-center" [attr.aria-label]="s.name + ' — strona główna'">
              @if (logo) {<img [src]="logo" [alt]="s.name" class="h-9 w-auto max-w-[180px] object-contain" />}
              @else {<span class="truncate text-[20px] font-semibold tracking-tight">{{ s.name }}</span>}
            </a>
          </ng-template>
          <ng-template #navLinks let-cls="cls">
            @if (s.menu.length) {
              @for (m of menuItems(); track $index) {<a [routerLink]="m.path" [queryParams]="m.query" [class]="cls">{{ m.label }}</a>}
            } @else {
              @for (c of store.topCategories().slice(0, 6); track c.id) {<a [routerLink]="['/kategoria', c.slug]" [class]="cls">{{ c.name }}</a>}
              @if (s.blog) {<a routerLink="/blog" [class]="cls">Blog</a>}
            }
          </ng-template>
          <ng-template #icons>
            @if (ts['showSearch'] !== 'no') {
              <form class="hidden md:block" role="search" (ngSubmit)="search()">
                <label class="sr-only" for="sf-search">Szukaj produktów</label>
                <input id="sf-search" name="q" type="search" class="sf-input !h-10 w-56" placeholder="Szukaj produktów…" [(ngModel)]="query" />
              </form>
            }
            <a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="flex size-10 items-center justify-center"
              [class.hidden]="bottomNav" [class.lg:flex]="bottomNav" [attr.aria-label]="customer.account() ? 'Moje konto' : 'Zaloguj się'">
              <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>
            </a>
            <a routerLink="/koszyk" class="relative flex size-10 items-center justify-center" [attr.aria-label]="'Koszyk, produktów: ' + cart.count()">
              <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
              @if (cart.count() > 0) {
                <span class="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-sf-primary px-1 text-[11px] font-bold text-sf-on-primary">{{ cart.count() }}</span>
              }
            </a>
          </ng-template>

          <header class="z-30 border-b border-sf-line bg-sf-bg/95 backdrop-blur" [class.sticky]="ts['stickyHeader'] !== 'no'" [class.top-0]="ts['stickyHeader'] !== 'no'">
            <div class="sf-container flex h-16 items-center gap-3">
              <button type="button" class="-ml-2 flex size-10 items-center justify-center lg:hidden" [class.hidden]="bottomNav" aria-label="Menu"
                aria-controls="sf-drawer" [attr.aria-expanded]="menu()" (click)="menu.set(true)">
                <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
              </button>
              @if (centered) {
                <div class="hidden flex-1 lg:block"></div>
                <div class="flex min-w-0 flex-1 justify-start lg:justify-center"><ng-container [ngTemplateOutlet]="brand" /></div>
                <div class="flex flex-1 items-center justify-end gap-1"><ng-container [ngTemplateOutlet]="icons" /></div>
              } @else {
                <ng-container [ngTemplateOutlet]="brand" />
                <nav class="ml-6 hidden items-center gap-6 lg:flex" aria-label="Kategorie">
                  <ng-container [ngTemplateOutlet]="navLinks" [ngTemplateOutletContext]="{ cls: 'text-[14px] font-medium hover:underline' }" />
                </nav>
                <div class="ml-auto flex items-center gap-1"><ng-container [ngTemplateOutlet]="icons" /></div>
              }
            </div>
            @if (centered) {
              <nav class="hidden border-t border-sf-line lg:block" aria-label="Kategorie">
                <div class="sf-container flex h-11 items-center justify-center gap-7">
                  <ng-container [ngTemplateOutlet]="navLinks" [ngTemplateOutletContext]="{ cls: 'text-[14px] font-medium hover:underline' }" />
                </div>
              </nav>
            }
          </header>

          <!-- Side menu (phones and tablets) -->
          <div class="fixed inset-0 z-50 lg:hidden" [class.pointer-events-none]="!menu()" [attr.aria-hidden]="!menu()">
            <div class="absolute inset-0 bg-black/40 transition-opacity" [class.opacity-0]="!menu()" (click)="menu.set(false)"></div>
            <aside id="sf-drawer" class="absolute inset-y-0 left-0 flex w-[85%] max-w-[340px] flex-col bg-sf-bg shadow-xl transition-transform duration-300"
              [class.-translate-x-full]="!menu()" role="dialog" aria-modal="true" aria-label="Menu sklepu" [attr.inert]="menu() ? null : ''">
              <div class="flex h-16 items-center justify-between border-b border-sf-line px-4">
                <ng-container [ngTemplateOutlet]="brand" />
                <button type="button" class="flex size-10 items-center justify-center" aria-label="Zamknij menu" (click)="menu.set(false)">
                  <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                </button>
              </div>
              <div class="flex-1 overflow-y-auto px-4 py-4">
                @if (ts['showSearch'] !== 'no') {
                  <form class="mb-4" role="search" (ngSubmit)="search()">
                    <label class="sr-only" for="sf-search-m">Szukaj produktów</label>
                    <input id="sf-search-m" name="qm" type="search" class="sf-input" placeholder="Szukaj produktów…" [(ngModel)]="query" />
                  </form>
                }
                <nav aria-label="Kategorie" class="flex flex-col">
                  <a routerLink="/produkty" class="border-b border-sf-line py-3 font-medium">Wszystkie produkty</a>
                  @if (s.menu.length) {
                    @for (m of menuItems(); track $index) {<a [routerLink]="m.path" [queryParams]="m.query" class="border-b border-sf-line py-3 font-medium">{{ m.label }}</a>}
                  } @else {
                    @for (c of store.topCategories(); track c.id) {<a [routerLink]="['/kategoria', c.slug]" class="border-b border-sf-line py-3 font-medium">{{ c.name }}</a>}
                    @if (s.blog) {<a routerLink="/blog" class="border-b border-sf-line py-3 font-medium">Blog</a>}
                  }
                </nav>
              </div>
              <div class="border-t border-sf-line p-4">
                <a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="sf-btn-outline w-full">{{ customer.account() ? 'Moje konto' : 'Zaloguj się' }}</a>
              </div>
            </aside>
          </div>

          @if (bottomNav) {
            <!-- Bottom navigation (phones): thumb-friendly shortcuts -->
            <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-sf-line bg-sf-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Nawigacja">
              <ul class="grid grid-cols-5 text-[11px]">
                <li><a routerLink="/" class="flex flex-col items-center gap-0.5 py-2" routerLinkActive="text-sf-primary" [routerLinkActiveOptions]="{ exact: true }">
                  <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z"/></svg>Start</a></li>
                <li><button type="button" class="flex w-full flex-col items-center gap-0.5 py-2" aria-controls="sf-drawer" [attr.aria-expanded]="menu()" (click)="menu.set(true)">
                  <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>Kategorie</button></li>
                <li><a routerLink="/szukaj" class="flex flex-col items-center gap-0.5 py-2" routerLinkActive="text-sf-primary">
                  <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>Szukaj</a></li>
                <li><a routerLink="/koszyk" class="relative flex flex-col items-center gap-0.5 py-2" routerLinkActive="text-sf-primary">
                  <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>Koszyk
                  @if (cart.count() > 0) {<span class="absolute right-[22%] top-1 min-w-4 rounded-full bg-sf-primary px-1 text-[10px] font-bold text-sf-on-primary">{{ cart.count() }}</span>}</a></li>
                <li><a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="flex flex-col items-center gap-0.5 py-2" routerLinkActive="text-sf-primary">
                  <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>Konto</a></li>
              </ul>
            </nav>
          }

          <main id="tresc" class="flex-1"><router-outlet /></main>

          <footer class="mt-16 border-t border-sf-line bg-sf-surface" [class.pb-16]="ts['mobileNav'] === 'bottom'" [class.lg:pb-0]="ts['mobileNav'] === 'bottom'">
            @if (ts['footerNewsletter'] !== 'no') {
              <div class="border-b border-sf-line">
                <div class="sf-container flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
                  <div><p class="text-[17px] font-semibold">Zapisz się na newsletter</p><p class="text-[14px] text-sf-muted">Nowości i promocje prosto na Twój e-mail.</p></div>
                  <sf-section-newsletter-compact />
                </div>
              </div>
            }
            <div class="sf-container grid gap-8 py-10 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p class="text-[17px] font-semibold">{{ s.name }}</p>
                @if (store.settings()['footerNote']) {<p class="mt-2 max-w-md text-sf-muted">{{ store.settings()['footerNote'] }}</p>}
                @if (socials().length) {
                  <ul class="mt-4 flex gap-2" aria-label="Media społecznościowe">
                    @for (so of socials(); track so.key) {
                      <li><a [href]="so.url" target="_blank" rel="noopener" class="flex size-10 items-center justify-center rounded-full border border-sf-line hover:border-sf-text" [attr.aria-label]="so.label">
                        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="so.icon" /></svg></a></li>
                    }
                  </ul>
                }
              </div>
              <div>
                <p class="font-semibold">Kategorie</p>
                <ul class="mt-2 space-y-1.5 text-sf-muted">
                  @for (c of store.topCategories().slice(0, 8); track c.id) {
                    <li><a [routerLink]="['/kategoria', c.slug]" class="hover:underline">{{ c.name }}</a></li>
                  }
                </ul>
              </div>
              @if (s.footerLinks.length || s.blog) {
                <div>
                  <p class="font-semibold">Informacje</p>
                  <ul class="mt-2 space-y-1.5 text-sf-muted">
                    @for (l of s.footerLinks; track l.path) {<li><a [routerLink]="l.path" class="hover:underline">{{ l.title }}</a></li>}
                    @if (s.blog) {<li><a routerLink="/blog" class="hover:underline">Blog</a></li>}
                  </ul>
                </div>
              }
              @if (s.seller; as seller) {
              <div>
                <p class="font-semibold">Sprzedawca</p>
                <address class="mt-2 space-y-1 not-italic text-sf-muted">
                  @if (seller.companyName) {<p>{{ seller.companyName }}</p>}
                  @if (seller.address) {<p>{{ seller.address }}</p>}
                  @if (seller.taxId) {<p>NIP {{ seller.taxId }}</p>}
                  @if (seller.email) {<p><a class="hover:underline" [href]="'mailto:' + seller.email">{{ seller.email }}</a></p>}
                  @if (seller.phone) {<p><a class="hover:underline" [href]="'tel:' + seller.phone">{{ seller.phone }}</a></p>}
                </address>
              </div>
              }
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
  protected readonly customer = inject(CustomerSession);
  /** Menu items may carry a query (`/szukaj?q=…`): routerLink needs it separately, or it would be encoded into the path. */
  protected readonly menuItems = computed(() => (this.store.store()?.menu ?? []).map((m) => ({ label: m.label, ...routeOf(m.path) })));
  private readonly router = inject(Router);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  protected readonly menu = signal(false);
  protected readonly year = new Date().getFullYear();
  protected query = '';
  protected readonly socials = computed(() => {
    const s = this.store.settings();
    return SOCIALS.filter((x) => s[x.key]).map((x) => ({ ...x, url: s[x.key] }));
  });

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
        void this.customer.load();
      }
    });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menu.set(false));
  }

  protected search(): void {
    const q = this.query.trim();
    if (q) void this.router.navigate(['/szukaj'], { queryParams: { q } });
  }
}
