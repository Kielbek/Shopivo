import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { money } from '../core/format';
import { routeOf } from '../core/link-token';
import { StoreState } from '../core/store-state';
import { SampleCard, StorefrontApi, ThemeSection } from '../storefront-api';
import { ProductCardComponent } from './product-card';
import { RichTextComponent } from './rich-text';
import { StarsComponent } from './stars';

/** Internal path (router link) or external https URL (new tab). */
function linkOf(value: string | undefined): { route: string; query: Record<string, string> | null } | { href: string } | null {
  if (!value) return null;
  if (value.startsWith('https://')) return { href: value };
  if (value.startsWith('/')) {
    const r = routeOf(value);
    return { route: r.path, query: r.query };
  }
  return null;
}

/** Small action link/button used by several sections. */
@Component({
  selector: 'sf-section-link',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = link();
    @if (l && text()) {
      @if ('href' in l) {
        <a [class]="cls()" [href]="l.href" target="_blank" rel="noopener">{{ text() }}</a>
      } @else {
        <a [class]="cls()" [routerLink]="l.route" [queryParams]="l.query">{{ text() }}</a>
      }
    }
  `,
})
export class SectionLinkComponent {
  readonly to = input<string>('');
  readonly text = input<string>('');
  readonly cls = input('sf-btn');
  protected readonly link = computed(() => linkOf(this.to()));
}

const ICONS: Record<string, string> = {
  truck: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  return: 'M4 8h11a5 5 0 0 1 0 10H8M4 8l4-4M4 8l4 4',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3ZM9 12l2 2 4-4',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-4-2-5 1Z',
  leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14ZM5 19l7-7',
  star: 'm12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8L12 3Z',
  chat: 'M4 5h16v11H9l-5 4V5Z',
};

/**
 * Example product of the template, shown only in the merchant's preview while the store has no products: same look as
 * a product card, but not a link and clearly marked.
 */
@Component({
  selector: 'sf-sample-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = product();
    @let sale = !!p.compareAtMinor && p.compareAtMinor > p.priceMinor;
    <div class="flex h-full flex-col" [attr.aria-label]="'Przykładowy produkt: ' + p.name">
      <div class="relative mb-3.5 overflow-hidden bg-sf-surface" [class]="vera() ? 'aspect-[3/4] rounded-xl' : 'sf-media aspect-square'">
        @if (p.imageUrl) {<img [src]="p.imageUrl" alt="" class="size-full object-cover" loading="lazy" />}
        <span class="absolute left-3 top-3 rounded bg-sf-bg/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">Przykład</span>
        @if (sale) {<span class="absolute right-3 top-3 rounded bg-sf-danger px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">Promocja</span>}
      </div>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-wider text-sf-muted">{{ p.category }}</p>
          <p class="mt-0.5 line-clamp-2 font-medium">{{ p.name }}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-[14px] font-semibold" [class.text-sf-danger]="sale">{{ fmt(p.priceMinor) }}</p>
          @if (sale) {<p class="text-[12px] text-sf-muted line-through">{{ fmt(p.compareAtMinor!) }}</p>}
        </div>
      </div>
    </div>
  `,
})
export class SampleCardComponent {
  private readonly store = inject(StoreState);
  readonly product = input.required<SampleCard>();
  protected readonly vera = computed(() => this.store.layout() === 'vera');

  protected fmt(minor: number): string {
    return money(minor, 'PLN');
  }
}

@Component({
  selector: 'sf-section-products',
  imports: [RouterLink, ProductCardComponent, SampleCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    @if (items().length || d['filters'] || samples().length) {
      <section class="sf-container" [attr.aria-label]="d['heading'] || 'Produkty'">
        @if (samples().length) {
          <p class="mb-4 rounded-lg border border-dashed border-sf-line px-4 py-2.5 text-center text-[13px] text-sf-muted" role="note">
            Przykładowe produkty szablonu — widzisz je tylko w podglądzie, dopóki nie dodasz własnych. Klienci ich nie zobaczą.</p>
        }
        @if (d['filters']) {
          <div class="flex flex-col justify-between gap-4 border-b border-sf-line pb-8 md:flex-row md:items-end">
            <div>
              @if (d['eyebrow']) {<p class="sf-eyebrow">{{ d['eyebrow'] }}</p>}
              @if (d['heading']) {<h2 class="mt-1 text-[32px] font-semibold leading-tight sm:text-[38px]">{{ d['heading'] }}</h2>}
              <p class="mt-1 text-[14px] text-sf-muted" aria-live="polite">{{ countLabel() }}</p>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-3">
              <div class="-mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Filtruj produkty">
                <button type="button" class="shrink-0 rounded-full px-4 py-2 text-[12px] font-medium transition" [class]="pill(filter() === null)" [attr.aria-pressed]="filter() === null" (click)="filter.set(null)">Wszystko</button>
                @for (c of filterCategories(); track c.id) {
                  <button type="button" class="shrink-0 rounded-full px-4 py-2 text-[12px] font-medium transition" [class]="pill(filter() === c.slug)" [attr.aria-pressed]="filter() === c.slug" (click)="filter.set(c.slug)">{{ c.name }}</button>
                }
                <button type="button" class="shrink-0 rounded-full px-4 py-2 text-[12px] font-medium transition" [class]="filter() === 'sale' ? 'bg-sf-danger text-white' : 'bg-sf-surface text-sf-danger hover:bg-sf-line'" [attr.aria-pressed]="filter() === 'sale'" (click)="filter.set('sale')">Promocje</button>
              </div>
              <label class="sr-only" [attr.for]="'sort-' + uid">Sortowanie</label>
              <select [id]="'sort-' + uid" class="h-9 rounded-lg border border-sf-line bg-sf-bg px-3 text-[12px] font-medium" [value]="sort()" (change)="sort.set($any($event.target).value)">
                <option value="NEWEST">Sortuj: najnowsze</option>
                <option value="PRICE_ASC">Cena: od najniższej</option>
                <option value="PRICE_DESC">Cena: od najwyższej</option>
              </select>
            </div>
          </div>
          @if (res.isLoading() && !items().length) {
            <ul class="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4" aria-hidden="true">
              @for (i of [0, 1, 2, 3]; track i) {<li><span class="sf-shimmer block aspect-[3/4] rounded-xl"></span></li>}
            </ul>
          } @else if (!items().length && !samples().length) {
            <p class="mt-10 text-center text-sf-muted">Brak produktów w tym wyborze.</p>
          }
        } @else {
          <div class="flex items-end justify-between gap-4">
            <div>
              @if (d['eyebrow']) {<p class="sf-eyebrow">{{ d['eyebrow'] }}</p>}
              @if (d['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
            </div>
            @if (d['buttonText']) {<a [routerLink]="moreLink()" [queryParams]="moreQuery()" class="shrink-0 text-[14px] font-medium hover:underline">{{ d['buttonText'] }} →</a>}
          </div>
        }
        @if (samples().length) {
          <ul class="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4" [class]="d['filters'] ? 'mt-10 sm:gap-x-6 sm:gap-y-10' : 'mt-5'">
            @for (p of samples(); track p.name) {<li><sf-sample-card [product]="p" /></li>}
          </ul>
        }
        @if (items().length) {
          <ul class="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4" [class]="d['filters'] ? 'mt-10 sm:gap-x-6 sm:gap-y-10 md:!grid-cols-3 lg:!grid-cols-4' : 'mt-5'">
            @for (p of items(); track p.id) {<li><sf-product-card [product]="p" /></li>}
          </ul>
          @if (d['filters'] && d['buttonText']) {
            <div class="mt-10 text-center"><a [routerLink]="moreLink()" [queryParams]="moreQuery()" class="sf-btn-line">{{ d['buttonText'] }}</a></div>
          }
        }
      </section>
    }
  `,
})
export class SectionProductsComponent {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  private readonly slug = computed(() => {
    const id = this.data()['category'];
    return this.data()['source'] === 'category' && id ? this.store.store()?.categories.find((c) => c.id === id)?.slug ?? null : null;
  });
  protected readonly uid = Math.random().toString(36).slice(2, 8);
  /** Visitor's filter in the "filters" mode: a top category slug, 'sale' or null (the section's own source). */
  protected readonly filter = signal<string | null>(null);
  protected readonly sort = signal('NEWEST');
  protected readonly filterCategories = computed(() => this.store.topCategories().slice(0, 6));
  protected readonly res = rxResource({
    params: () => {
      const f = this.data()['filters'] ? this.filter() : null;
      return { source: f === 'sale' ? 'sale' : f ? 'category' : this.data()['source'], slug: f && f !== 'sale' ? f : f === 'sale' ? null : this.slug(),
        size: Number(this.data()['count'] ?? 8), sort: this.sort() };
    },
    stream: ({ params }) => this.api.products({ size: params.size, sort: params.sort, kategoria: params.slug ?? undefined, promocje: params.source === 'sale' }),
  });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().items : []));
  protected readonly total = computed(() => (this.res.hasValue() ? this.res.value().totalItems : 0));
  /** Preview of an empty store: the template's example products (filtered by the visitor's category pill by name). */
  protected readonly samples = computed<SampleCard[]>(() => {
    if (!this.res.hasValue() || this.res.value().totalItems > 0 || this.filter() !== null && this.filter() !== 'sale') return [];
    const all = this.store.samples();
    const list = this.filter() === 'sale' ? all.filter((p) => p.compareAtMinor) : all;
    return list.slice(0, Number(this.data()['count'] ?? 8));
  });
  protected readonly moreLink = computed(() => {
    const f = this.data()['filters'] ? this.filter() : null;
    const slug = f && f !== 'sale' ? f : f === 'sale' ? null : this.slug();
    return slug ? ['/kategoria', slug] : ['/produkty'];
  });
  protected readonly moreQuery = computed(() => ((this.data()['filters'] ? this.filter() === 'sale' : this.data()['source'] === 'sale') ? { promocje: 'tak' } : null));

  protected countLabel(): string {
    const n = this.total() || this.samples().length;
    const word = n === 1 ? 'produkt' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'produkty' : 'produktów';
    return `${n} ${word}`;
  }

  protected pill(active: boolean): string {
    return active ? 'bg-sf-text text-sf-bg' : 'bg-sf-surface text-sf-text hover:bg-sf-line';
  }
}

@Component({
  selector: 'sf-section-reviews',
  imports: [RouterLink, StarsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="sf-container" [attr.aria-label]="data()['heading'] || 'Opinie klientów'">
        @if (data()['heading']) {<h2 class="text-center text-[26px] font-semibold tracking-tight">{{ data()['heading'] }}</h2>}
        <ul class="mt-6 grid gap-4 md:grid-cols-3">
          @for (r of items(); track $index) {
            <li class="sf-panel flex flex-col p-5">
              <sf-stars [value]="r.rating" />
              <p class="mt-3 line-clamp-5 flex-1 text-[15px] leading-6">„{{ r.body }}”</p>
              <p class="mt-4 text-[13px] font-medium">{{ r.authorName }}</p>
              <a [routerLink]="['/produkt', r.productSlug]" class="text-[13px] text-sf-muted hover:underline">{{ r.productName }}</a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class SectionReviewsComponent {
  private readonly api = inject(StorefrontApi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  private readonly res = rxResource({ stream: () => this.api.latestReviews() });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().slice(0, 3) : []));
}

@Component({
  selector: 'sf-section-blog',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="sf-container" [attr.aria-label]="data()['heading'] || 'Blog'">
        <div class="flex items-end justify-between gap-4">
          @if (data()['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ data()['heading'] }}</h2>}
          <a routerLink="/blog" class="shrink-0 text-[14px] font-medium hover:underline">Wszystkie wpisy →</a>
        </div>
        <ul class="mt-5 grid gap-4 md:grid-cols-3">
          @for (p of items(); track p.slug) {
            <li><a [routerLink]="['/blog', p.slug]" class="sf-panel block h-full p-5 hover:border-sf-text">
              <p class="text-[17px] font-semibold">{{ p.title }}</p>
              @if (p.excerpt) {<p class="mt-2 line-clamp-3 text-[14px] text-sf-muted">{{ p.excerpt }}</p>}
            </a></li>
          }
        </ul>
      </section>
    }
  `,
})
export class SectionBlogComponent {
  private readonly api = inject(StorefrontApi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  private readonly res = rxResource({ stream: () => this.api.posts(0) });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().items.slice(0, Number(this.data()['count'] ?? 3)) : []));
}

@Component({
  selector: 'sf-section-newsletter',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <section class="bg-sf-soft">
      <div class="sf-container max-w-2xl py-14 text-center">
        <h2 class="text-[26px] font-semibold tracking-tight">{{ d['heading'] || 'Newsletter' }}</h2>
        @if (d['text']) {<p class="mt-2 text-sf-muted">{{ d['text'] }}</p>}
        @if (state() === 'sent') {
          <p class="mt-6 font-medium" role="status">Dziękujemy! Sprawdź skrzynkę i potwierdź zapis, klikając link w wiadomości.</p>
        } @else {
          <form class="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row" (ngSubmit)="submit()">
            <label class="sr-only" for="nl-{{ uid }}">Adres e-mail</label>
            <input id="nl-{{ uid }}" name="email" type="email" required autocomplete="email" class="sf-input flex-1" placeholder="Twój adres e-mail" [(ngModel)]="email" />
            <button type="submit" class="sf-btn shrink-0" [disabled]="state() === 'busy'">{{ d['button'] || 'Zapisz się' }}</button>
          </form>
          @if (error(); as e) {<p class="mt-2 text-[14px] text-red-700" role="alert">{{ e }}</p>}
          <p class="mx-auto mt-3 max-w-md text-[12px] text-sf-muted">Zapisując się, zgadzasz się na otrzymywanie informacji handlowych e-mailem.
            Szczegóły w <a routerLink="/strona/polityka-prywatnosci" class="underline">polityce prywatności</a>.</p>
        }
      </div>
    </section>
  `,
})
export class SectionNewsletterComponent {
  private readonly api = inject(StorefrontApi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  protected readonly uid = Math.random().toString(36).slice(2, 8);
  protected email = '';
  protected readonly state = signal<'idle' | 'busy' | 'sent'>('idle');
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('Podaj prawidłowy adres e-mail.');
      return;
    }
    this.state.set('busy');
    this.error.set(null);
    try {
      await firstValueFrom(this.api.subscribeNewsletter(this.email.trim(), null));
      this.state.set('sent');
    } catch {
      this.error.set('Nie udało się zapisać. Spróbuj ponownie za chwilę.');
      this.state.set('idle');
    }
  }
}

/** One-line newsletter form for the footer (same double opt-in flow). */
@Component({
  selector: 'sf-section-newsletter-compact',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'sent') {
      <p class="text-[14px] font-medium" role="status">Sprawdź skrzynkę i potwierdź zapis.</p>
    } @else {
      <form class="flex w-full max-w-md gap-2" (ngSubmit)="submit()">
        <label class="sr-only" for="nl-footer">Adres e-mail do newslettera</label>
        <input id="nl-footer" name="email" type="email" required autocomplete="email" class="sf-input !h-11 flex-1" placeholder="Twój e-mail" [(ngModel)]="email" />
        <button type="submit" class="sf-btn !h-11 shrink-0" [disabled]="state() === 'busy'">Zapisz</button>
      </form>
      @if (error(); as e) {<p class="mt-1 text-[13px] text-red-700" role="alert">{{ e }}</p>}
    }
  `,
})
export class SectionNewsletterCompactComponent {
  private readonly api = inject(StorefrontApi);
  protected email = '';
  protected readonly state = signal<'idle' | 'busy' | 'sent'>('idle');
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('Podaj prawidłowy adres e-mail.');
      return;
    }
    this.state.set('busy');
    this.error.set(null);
    try {
      await firstValueFrom(this.api.subscribeNewsletter(this.email.trim(), null));
      this.state.set('sent');
    } catch {
      this.error.set('Nie udało się zapisać. Spróbuj ponownie.');
      this.state.set('idle');
    }
  }
}

/** Floating card on the editorial banner: the newest available product, linked to its page. */
@Component({
  selector: 'sf-section-featured',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!product() && sample(); as p) {
      <div class="flex max-w-xs items-center gap-4 rounded-xl border border-sf-line bg-sf-bg/95 p-4 shadow-lg backdrop-blur-md">
        @if (p.imageUrl) {<img [src]="p.imageUrl" alt="" class="h-16 w-14 shrink-0 rounded-lg object-cover" />}
        <span class="min-w-0">
          <span class="block text-[11px] uppercase tracking-widest text-sf-muted">Polecamy · przykład</span>
          <span class="block truncate text-[14px] font-semibold">{{ p.name }}</span>
          <span class="mt-0.5 block text-[12px] font-medium text-sf-accent">{{ price(p.priceMinor, 'PLN') }}</span>
        </span>
      </div>
    }
    @if (product(); as p) {
      <a [routerLink]="['/produkt', p.slug]" class="flex max-w-xs items-center gap-4 rounded-xl border border-sf-line bg-sf-bg/95 p-4 shadow-lg backdrop-blur-md transition hover:shadow-xl">
        @if (p.imageUrl) {<img [src]="p.imageUrl" alt="" class="h-16 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
        <span class="min-w-0">
          <span class="block text-[11px] uppercase tracking-widest text-sf-muted">Polecamy</span>
          <span class="block truncate text-[14px] font-semibold">{{ p.name }}</span>
          <span class="mt-0.5 block text-[12px] font-medium text-sf-accent">{{ price(p.priceMinor, p.currency) }} → Zobacz</span>
        </span>
      </a>
    }
  `,
})
export class SectionFeaturedComponent {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly res = rxResource({ stream: () => this.api.products({ size: 6, sort: 'NEWEST' }) });
  protected readonly sample = computed(() => (this.res.hasValue() && this.res.value().totalItems === 0 ? this.store.samples()[0] ?? null : null));
  protected readonly product = computed(() => (this.res.hasValue() ? this.res.value().items.find((p) => p.available && p.imageUrl) ?? null : null));

  protected price(minor: number, currency: string): string {
    return money(minor, currency);
  }
}

/**
 * Renders the store's home-page sections in order. Each section is self-contained and fetches its own data (products,
 * reviews, posts) so a merchant can combine them freely; every image comes from the store's own library.
 */
@Component({
  selector: 'sf-home-sections',
  imports: [RouterLink, RichTextComponent, SectionLinkComponent, SectionProductsComponent, SectionFeaturedComponent,
    SectionReviewsComponent, SectionBlogComponent, SectionNewsletterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (s of store.sections(); track s.id; let first = $first) {
      @let d = s.data;
      @switch (s.type) {
        @case ('hero') {
          @let img = store.image(d['image']);
          @let pad = d['height'] === 'large' ? 'py-24 sm:py-36' : d['height'] === 'small' ? 'py-10 sm:py-14' : 'py-16 sm:py-24';
          @if (d['layout'] === 'editorial') {
            <!-- Magazine-style split: eyebrow, large display heading, two square buttons, tall photo with a product card -->
            <section class="overflow-hidden bg-sf-surface" [attr.aria-label]="d['heading'] || store.store()?.name">
              <div class="sf-container grid items-center gap-10 py-12 lg:grid-cols-12 lg:py-20">
                <div class="space-y-6 lg:col-span-6">
                  @if (d['eyebrow']) {<p class="sf-eyebrow">{{ d['eyebrow'] }}</p>}
                  <h1 class="text-[40px] font-semibold leading-[1.08] sm:text-[56px] lg:text-[64px]">{{ d['heading'] || store.store()?.name }}</h1>
                  @if (d['subheading']) {<p class="max-w-lg whitespace-pre-line text-[16px] leading-relaxed text-sf-muted sm:text-[18px]">{{ d['subheading'] }}</p>}
                  <div class="flex flex-wrap gap-4 pt-2">
                    <sf-section-link [to]="d['link'] || '/produkty'" [text]="d['cta']" cls="sf-btn sf-btn-caps" />
                    <sf-section-link [to]="d['link2']" [text]="d['cta2']" cls="sf-btn-line" />
                  </div>
                </div>
                <div class="relative lg:col-span-6">
                  <div class="aspect-[4/5] overflow-hidden rounded-2xl bg-sf-line shadow-xl sm:aspect-[16/11] lg:aspect-[4/5]">
                    @if (img) {<img [src]="img" alt="" class="size-full object-cover transition duration-700 hover:scale-105" [attr.fetchpriority]="first ? 'high' : null" />}
                  </div>
                  @if (d['featured']) {<sf-section-featured class="absolute -bottom-5 -left-6 hidden sm:block" />}
                </div>
              </div>
            </section>
          } @else if (d['layout'] === 'image' && img) {
            <section class="relative isolate overflow-hidden text-white" [attr.aria-label]="d['heading'] || store.store()?.name">
              <img [src]="img" alt="" class="absolute inset-0 -z-10 size-full object-cover" [attr.fetchpriority]="first ? 'high' : null" />
              <div class="absolute inset-0 -z-10 bg-black/45"></div>
              <div class="sf-container {{ pad }}">
                <div class="max-w-2xl">
                  <h1 class="text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[52px]">{{ d['heading'] || store.store()?.name }}</h1>
                  @if (d['subheading']) {<p class="mt-4 whitespace-pre-line text-[17px] opacity-90">{{ d['subheading'] }}</p>}
                  <sf-section-link class="mt-8 inline-block" [to]="d['link'] || '/produkty'" [text]="d['cta']" cls="sf-btn !bg-white !text-black" />
                </div>
              </div>
            </section>
          } @else {
            <section [class]="d['layout'] === 'banner' ? 'bg-sf-primary text-sf-on-primary' : d['layout'] === 'split' ? 'bg-sf-surface' : 'bg-sf-soft'">
              <div [class]="'sf-container ' + pad + (d['layout'] === 'split' && img ? ' grid items-center gap-8 md:grid-cols-2' : ' text-center')">
                <div [class.mx-auto]="d['layout'] !== 'split' || !img" [class.max-w-2xl]="d['layout'] !== 'split' || !img">
                  <h1 class="text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[48px]">{{ d['heading'] || store.store()?.name }}</h1>
                  @if (d['subheading']) {<p class="mt-4 whitespace-pre-line text-[17px] opacity-80">{{ d['subheading'] }}</p>}
                  <sf-section-link class="mt-8 inline-block" [to]="d['link'] || '/produkty'" [text]="d['cta']"
                    [cls]="d['layout'] === 'banner' ? 'sf-btn !bg-sf-bg !text-sf-text' : 'sf-btn'" />
                </div>
                @if (d['layout'] === 'split' && img) {
                  <div class="sf-media aspect-[4/3]"><img [src]="img" alt="" class="size-full object-cover" /></div>
                }
              </div>
            </section>
          }
        }
        @case ('usp') {
          <section class="sf-container mt-12" aria-label="Dlaczego warto">
            <ul class="grid gap-4 sm:grid-cols-2" [class.lg:grid-cols-3]="(d['items']?.length ?? 3) === 3" [class.lg:grid-cols-4]="d['items']?.length === 4">
              @for (u of d['items']; track $index) {
                <li class="sf-panel flex items-start gap-3 p-5">
                  <svg viewBox="0 0 24 24" class="size-7 shrink-0 text-sf-primary" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="icon(u.icon)" /></svg>
                  <div><p class="font-semibold">{{ u.title }}</p>@if (u.text) {<p class="mt-0.5 text-[14px] text-sf-muted">{{ u.text }}</p>}</div>
                </li>
              }
            </ul>
          </section>
        }
        @case ('categories') {
          @let cats = categoriesFor(s);
          @if (cats.length) {
            <section class="sf-container mt-14" [attr.aria-label]="d['heading'] || 'Kategorie'">
              @if (d['eyebrow']) {<p class="sf-eyebrow">{{ d['eyebrow'] }}</p>}
              @if (d['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
              @if (d['style'] === 'chips') {
                <ul class="mt-5 flex flex-wrap gap-2">
                  @for (c of cats; track c.id) {<li><a [routerLink]="['/kategoria', c.slug]" class="sf-btn-outline !h-10">{{ c.name }}</a></li>}
                </ul>
              } @else {
                <ul class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  @for (c of cats; track c.id) {
                    <li><a [routerLink]="['/kategoria', c.slug]" class="group relative block overflow-hidden" style="border-radius: var(--sf-radius)">
                      @if (c.image) {
                        <img [src]="c.image['w400']" alt="" class="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" width="400" height="500" />
                      } @else {
                        <span class="flex aspect-[4/5] w-full items-center justify-center bg-sf-soft text-[42px] font-semibold opacity-60" aria-hidden="true">{{ c.name[0] }}</span>
                      }
                      <span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-[16px] font-semibold text-white">{{ c.name }}</span>
                    </a></li>
                  }
                </ul>
              }
            </section>
          }
        }
        @case ('tiles') {
          @if (d['items']?.length) {
            <section class="sf-container mt-16" [attr.aria-label]="d['heading'] || 'Kafelki'">
              @if (d['eyebrow'] || d['heading']) {
                <div class="mb-8">
                  @if (d['eyebrow']) {<p class="text-[12px] uppercase tracking-[0.2em] text-sf-muted">{{ d['eyebrow'] }}</p>}
                  @if (d['heading']) {<h2 class="mt-1 text-[32px] font-semibold">{{ d['heading'] }}</h2>}
                </div>
              }
              <ul class="grid gap-4 sm:gap-6" [class]="tileCols(d['items'].length)">
                @for (t of d['items']; track $index) {
                  @let timg = store.image(t.image, 'w1200');
                  @let l = tileLink(t.link);
                  <li>
                    <a [routerLink]="l.path" [queryParams]="l.query" class="group relative block h-80 overflow-hidden rounded-xl bg-sf-line text-white">
                      @if (timg) {<img [src]="timg" alt="" class="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />}
                      <span class="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" aria-hidden="true"></span>
                      <span class="absolute bottom-6 left-6 right-6">
                        <span class="sf-display block text-[26px] font-semibold leading-tight">{{ t.title }}</span>
                        @if (t.text) {<span class="mt-1 block text-[12px] uppercase tracking-wider text-white/85 group-hover:underline">{{ t.text }} →</span>}
                      </span>
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
        }
        @case ('banner') {
          @let bimg = store.image(d['image']);
          <section class="sf-container mt-16" [attr.aria-label]="d['heading'] || 'Baner'">
            <div class="relative overflow-hidden rounded-2xl bg-[#141413] text-white">
              @if (bimg) {<img [src]="bimg" alt="" class="h-80 w-full object-cover opacity-45 sm:h-96" loading="lazy" />}
              @else {<div class="h-80 sm:h-96"></div>}
              <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                @if (d['eyebrow']) {<p class="mb-3 text-[12px] font-semibold uppercase tracking-[0.25em]" style="color: color-mix(in srgb, var(--sf-accent) 35%, #fff)">{{ d['eyebrow'] }}</p>}
                @if (d['heading']) {<h2 class="max-w-2xl text-[32px] font-semibold leading-tight sm:text-[48px]">{{ d['heading'] }}</h2>}
                @if (d['text']) {<p class="mt-4 max-w-xl whitespace-pre-line text-[14px] text-white/85 sm:text-[16px]">{{ d['text'] }}</p>}
                <sf-section-link class="mt-6 inline-block" [to]="d['link']" [text]="d['cta']" cls="sf-btn sf-btn-caps !bg-white !text-black" />
              </div>
            </div>
          </section>
        }
        @case ('products') {<sf-section-products class="mt-14 block" [data]="d" />}
        @case ('image_text') {
          @let img = store.image(d['image']);
          <section class="sf-container mt-16">
            <div class="grid items-center gap-8 md:grid-cols-2">
              <div class="sf-media aspect-[4/3]" [class.md:order-2]="d['imageSide'] === 'right'">
                @if (img) {<img [src]="img" alt="" class="size-full object-cover" loading="lazy" />}
              </div>
              <div>
                @if (d['heading']) {<h2 class="text-[26px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
                @if (d['text']) {<p class="mt-3 whitespace-pre-line text-[16px] leading-7 text-sf-muted">{{ d['text'] }}</p>}
                <sf-section-link class="mt-6 inline-block" [to]="d['link']" [text]="d['cta']" cls="sf-btn-outline" />
              </div>
            </div>
          </section>
        }
        @case ('faq') {
          @if (d['items']?.length) {
            <section class="sf-container mt-16 max-w-3xl" [attr.aria-label]="d['heading'] || 'Najczęstsze pytania'">
              @if (d['heading']) {<h2 class="text-center text-[26px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
              <div class="mt-6 divide-y divide-sf-line border-y border-sf-line">
                @for (f of d['items']; track $index) {
                  <details class="group py-4">
                    <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">{{ f.question }}
                      <span class="text-[22px] leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
                    <p class="mt-3 whitespace-pre-line text-sf-muted">{{ f.answer }}</p>
                  </details>
                }
              </div>
            </section>
          }
        }
        @case ('newsletter') {<sf-section-newsletter class="mt-16 block" [data]="d" />}
        @case ('reviews') {<sf-section-reviews class="mt-16 block" [data]="d" />}
        @case ('rich_text') {
          <section class="sf-container mt-16 max-w-3xl" [class.text-center]="d['align'] === 'center'">
            @if (d['heading']) {<h2 class="text-[26px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
            @if (d['text']) {<div class="mt-4 text-[16px] leading-7"><sf-rich-text [source]="d['text']" /></div>}
          </section>
        }
        @case ('blog') {<sf-section-blog class="mt-16 block" [data]="d" />}
      }
    }
  `,
})
export class HomeSectionsComponent {
  protected readonly store = inject(StoreState);

  protected icon(key: string): string {
    return ICONS[key] ?? ICONS['star'];
  }

  protected tileCols(n: number): string {
    return n >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : n === 3 ? 'md:grid-cols-3' : n === 2 ? 'md:grid-cols-2' : '';
  }

  /** Tile links are internal paths (validated by the server); anything else falls back to all products. */
  protected tileLink(value: string | undefined): { path: string; query: Record<string, string> | null } {
    return value?.startsWith('/') ? routeOf(value) : { path: '/produkty', query: null };
  }

  protected categoriesFor(s: ThemeSection) {
    const ids: string[] = s.data['categories'] ?? [];
    const all = this.store.store()?.categories ?? [];
    return ids.length ? ids.map((id) => all.find((c) => c.id === id)).filter((c) => !!c) : this.store.topCategories().slice(0, 8);
  }
}
