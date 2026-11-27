import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { money } from '../core/format';
import { routeOf } from '../core/link-token';
import { StoreState } from '../core/store-state';
import { SampleCard, StorefrontApi, ThemeSection } from '../storefront-api';
import { ProductCardComponent } from './product-card';
import { RichTextComponent } from './rich-text';
import { StarsComponent } from './stars';
import { PremiumIconComponent } from './premium-icon';

/** Section sources served by the recommendation endpoint (`/collections/{slug}`). */
const COLLECTIONS: Record<string, string> = {
  bestsellers: 'bestsellery', last_pieces: 'koncowki', top_rated: 'najlepiej-oceniane', back_in_stock: 'wracaja',
};

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
    @if (playful()) {
      <div class="relative flex h-full flex-col rounded-[20px] border border-sf-line p-1 pb-3 text-center" [attr.aria-label]="'Przykładowy produkt: ' + p.name">
        <span class="relative block aspect-square overflow-hidden rounded-[16px] bg-sf-surface">
          @if (p.imageUrl) {<img [src]="p.imageUrl" alt="" class="size-full object-cover" loading="lazy" />}
          <span class="absolute right-2.5 top-2.5 rounded-full bg-sf-bg/85 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">Przykład</span>
          @if (sale) {<span class="absolute left-2.5 top-2.5 rotate-[-6deg] rounded-full bg-[#d36420] px-2.5 py-1 text-[12px] font-black text-white">−{{ off(p) }}%</span>}
        </span>
        <span class="mt-3 block px-2 text-[15px] font-extrabold leading-snug sm:text-[17px]">{{ p.name }}</span>
        <span class="mt-1 block text-[14px] font-bold text-sf-primary">{{ fmt(p.priceMinor) }}@if (sale) {<del class="ml-1 text-[12px] font-semibold text-sf-muted">{{ fmt(p.compareAtMinor!) }}</del>}</span>
        <span class="mx-auto mt-3 rounded-full bg-sf-primary px-5 py-2 text-[13px] font-extrabold text-sf-on-primary opacity-60">Do koszyka</span>
      </div>
    } @else {
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
    }
  `,
})
export class SampleCardComponent {
  private readonly store = inject(StoreState);
  readonly product = input.required<SampleCard>();
  protected readonly vera = computed(() => this.store.layout() === 'vera');
  protected readonly playful = computed(() => this.store.layout() === 'bawiloo');

  protected fmt(minor: number): string {
    return money(minor, 'PLN');
  }

  protected off(p: SampleCard): number {
    return p.compareAtMinor ? Math.round((1 - p.priceMinor / p.compareAtMinor) * 100) : 0;
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
              @if (!ranked()) {<p class="mt-1 text-[14px] text-sf-muted" aria-live="polite">{{ countLabel() }}</p>}
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
        } @else if (centered()) {
          <!-- Centred display heading: eyebrow ✦, heading with an optional tilted accent line, short text -->
          <div class="text-center">
            @if (d['eyebrow']) {<p class="mb-3 text-[12px] font-black uppercase tracking-[0.19em] text-sf-primary sm:text-[14px]"><span aria-hidden="true">✦ </span>{{ d['eyebrow'] }}<span aria-hidden="true"> ✦</span></p>}
            @if (d['heading'] || d['accent']) {
              <h2 class="text-[30px] font-bold uppercase leading-[1.02] tracking-[-0.035em] sm:text-[48px] lg:text-[68px]">
                @if (d['heading']) {<span class="block">{{ d['heading'] }}</span>}
                @if (d['accent']) {<span class="sf-accent-line">{{ d['accent'] }}</span>}
              </h2>
            }
            @if (d['text']) {<p class="mx-auto mt-3 max-w-xl text-[14px] font-semibold text-sf-muted sm:text-[16px]">{{ d['text'] }}</p>}
          </div>
        } @else {
          <div class="flex items-end justify-between gap-4">
            <div>
              @if (d['eyebrow']) {<p class="sf-eyebrow">{{ d['eyebrow'] }}</p>}
              @if (d['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ d['heading'] }}@if (d['accent']) { <span class="text-sf-accent">{{ d['accent'] }}</span>}</h2>}
              @if (d['text']) {<p class="mt-1 text-[14px] text-sf-muted">{{ d['text'] }}</p>}
            </div>
            @if (d['buttonText']) {<a [routerLink]="moreLink()" [queryParams]="moreQuery()" class="shrink-0 text-[14px] font-medium hover:underline">{{ d['buttonText'] }} →</a>}
          </div>
        }
        @if (d['style'] === 'carousel' && (samples().length || items().length)) {
          <!-- Carousel: native horizontal scrolling with snap points, arrows for mouse users -->
          <div class="relative mt-8">
            <button type="button" class="absolute -left-1 top-[38%] z-10 hidden size-11 items-center justify-center rounded-full border border-sf-line bg-sf-bg/80 transition hover:border-sf-primary hover:bg-sf-primary hover:text-sf-on-primary sm:flex"
              aria-label="Poprzednie produkty" [attr.aria-controls]="'car-' + uid" (click)="scroll(track, -1)">
              <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
            <ul #track [id]="'car-' + uid" class="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-3 [scrollbar-width:none] sm:mx-14" aria-label="Karuzela produktów">
              @for (p of samples(); track p.name) {<li class="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]"><sf-sample-card [product]="p" /></li>}
              @for (p of items(); track p.id) {<li class="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]"><sf-product-card [product]="p" /></li>}
            </ul>
            <button type="button" class="absolute -right-1 top-[38%] z-10 hidden size-11 items-center justify-center rounded-full border border-sf-line bg-sf-bg/80 transition hover:border-sf-primary hover:bg-sf-primary hover:text-sf-on-primary sm:flex"
              aria-label="Następne produkty" [attr.aria-controls]="'car-' + uid" (click)="scroll(track, 1)">
              <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
        } @else {
          @if (samples().length) {
            <ul class="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3" [class]="(d['filters'] ? 'mt-10 sm:gap-x-6 sm:gap-y-10' : centered() ? 'mt-10' : 'mt-5') + (threeCols() ? ' lg:grid-cols-3 lg:gap-6' : ' lg:grid-cols-4')">
              @for (p of samples(); track p.name) {<li><sf-sample-card [product]="p" /></li>}
            </ul>
          }
          @if (items().length) {
            <ul class="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3" [class]="(d['filters'] ? 'mt-10 sm:gap-x-6 sm:gap-y-10' : centered() ? 'mt-10' : 'mt-5') + (threeCols() ? ' lg:grid-cols-3 lg:gap-6' : ' lg:grid-cols-4')">
              @for (p of items(); track p.id) {<li><sf-product-card [product]="p" /></li>}
            </ul>
          }
        }
        @if ((items().length || samples().length) && d['buttonText'] && (d['filters'] || centered())) {
          <div class="mt-10 text-center">
            <a [routerLink]="moreLink()" [queryParams]="moreQuery()" [class]="centered() ? 'inline-flex rounded-full bg-sf-primary px-6 py-3 text-[13px] font-extrabold uppercase text-sf-on-primary hover:opacity-90' : 'sf-btn-line'">{{ d['buttonText'] }}</a>
          </div>
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
      const own = this.data()['source'];
      // A category pill narrows a ranked list (e.g. bestsellers in "Pluszaki") instead of replacing it
      return { source: f === 'sale' ? 'sale' : f ? (COLLECTIONS[own] ? own : 'category') : own, slug: f && f !== 'sale' ? f : f === 'sale' ? null : this.slug(),
        size: Number(this.data()['count'] ?? 8), sort: this.sort() };
    },
    stream: ({ params }) => {
      // Recommendation lists (bestsellers etc.) come ranked from the server; the visitor's sort switches to the catalogue
      const list = COLLECTIONS[params.source as string];
      if (list && params.sort === 'NEWEST') {
        return this.api.collection(list, params.size, params.slug ?? undefined)
          .pipe(map((items) => ({ items, totalItems: items.length, page: 0, size: params.size, totalPages: 1 })));
      }
      return this.api.products({ size: params.size, sort: params.sort, kategoria: params.slug ?? undefined, promocje: params.source === 'sale' });
    },
  });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().items : []));
  protected readonly total = computed(() => (this.res.hasValue() ? this.res.value().totalItems : 0));
  /** Lists ranked by the server show no product count (it is a selection, not the whole catalogue). */
  protected readonly ranked = computed(() => !!COLLECTIONS[this.data()['source']] && this.sort() === 'NEWEST');
  /** Preview of an empty store: the template's example products (filtered by the visitor's category pill by name). */
  protected readonly samples = computed<SampleCard[]>(() => {
    if (this.filter() !== null && this.filter() !== 'sale') return [];
    const all = this.store.samples();
    const sale = this.filter() === 'sale' || (this.filter() === null && this.data()['source'] === 'sale');
    const list = sale ? all.filter((p) => p.compareAtMinor) : all;
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

  /** Playful layouts centre the heading block and use three wide columns. */
  protected readonly centered = computed(() => this.store.layout() === 'bawiloo');
  protected readonly threeCols = computed(() => this.store.layout() === 'bawiloo' && !this.data()['filters']);

  protected scroll(el: HTMLElement, dir: number): void {
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
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
    @if (playful()) {
      <!-- Playful: big rounded warm card, heading left, form right -->
      <section class="sf-container pb-6" aria-labelledby="nl-h-{{ uid }}">
        <div class="relative overflow-hidden rounded-[32px] bg-sf-primary px-6 py-10 text-sf-on-primary sm:rounded-[40px] sm:px-12 sm:py-14">
          <span class="absolute -bottom-24 -right-16 size-72 rounded-full border-[28px] border-white/20" aria-hidden="true"></span>
          <div class="relative grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              @if (d['eyebrow']) {<p class="mb-3 text-[12px] font-black uppercase tracking-[0.2em]"><span aria-hidden="true">✦ </span>{{ d['eyebrow'] }}</p>}
              <h2 id="nl-h-{{ uid }}" class="text-[clamp(34px,5vw,60px)] font-bold leading-[0.98] tracking-[-0.035em]">{{ d['heading'] || 'Newsletter' }}</h2>
              @if (d['text']) {<p class="mt-4 max-w-md text-[15px] font-bold opacity-85">{{ d['text'] }}</p>}
            </div>
            <div>
              @if (state() === 'sent') {
                <p class="text-[16px] font-bold" role="status">Dziękujemy! Sprawdź skrzynkę i potwierdź zapis, klikając link w wiadomości.</p>
              } @else {
                <form (ngSubmit)="submit()">
                  <label class="mb-2 block text-[13px] font-bold" for="nl-{{ uid }}">Twój adres e-mail</label>
                  <div class="flex flex-col gap-2 rounded-[28px] bg-white p-1.5 sm:flex-row sm:rounded-full">
                    <input id="nl-{{ uid }}" name="email" type="email" required autocomplete="email" class="h-11 min-w-0 flex-1 rounded-full bg-transparent px-4 text-[15px] text-[#151513] outline-none placeholder:text-[#151513]/45" placeholder="np. twoj@email.pl" [(ngModel)]="email" />
                    <button type="submit" class="h-11 shrink-0 rounded-full bg-sf-bg px-6 text-[14px] font-extrabold text-sf-text disabled:opacity-60" [disabled]="state() === 'busy'">{{ d['button'] || 'Zapisz się' }} ↗</button>
                  </div>
                  @if (error(); as e) {<p class="mt-2 text-[14px] font-bold" role="alert">{{ e }}</p>}
                  <p class="mt-3 text-[12px] font-semibold opacity-80">Zapisując się, zgadzasz się na otrzymywanie informacji handlowych e-mailem.
                    Szczegóły w <a routerLink="/strona/polityka-prywatnosci" class="underline">polityce prywatności</a>.</p>
                </form>
              }
            </div>
          </div>
        </div>
      </section>
    } @else {
    <section class="bg-sf-soft">
      <div class="sf-container max-w-2xl py-14 text-center">
        @if (d['eyebrow']) {<p class="sf-eyebrow mb-2">{{ d['eyebrow'] }}</p>}
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
          @if (error(); as e) {<p class="mt-2 text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
          <p class="mx-auto mt-3 max-w-md text-[12px] text-sf-muted">Zapisując się, zgadzasz się na otrzymywanie informacji handlowych e-mailem.
            Szczegóły w <a routerLink="/strona/polityka-prywatnosci" class="underline">polityce prywatności</a>.</p>
        }
      </div>
    </section>
    }
  `,
})
export class SectionNewsletterComponent {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  protected readonly playful = computed(() => this.store.layout() === 'bawiloo');
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
      @if (error(); as e) {<p class="mt-1 text-[13px] text-sf-danger" role="alert">{{ e }}</p>}
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
  protected readonly sample = computed(() => this.store.samples()[0] ?? null);
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
  imports: [RouterLink, RichTextComponent, SectionLinkComponent, SectionProductsComponent, SectionFeaturedComponent, PremiumIconComponent,
    SectionReviewsComponent, SectionBlogComponent, SectionNewsletterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (s of store.sections(); track s.id; let first = $first) {
      @let d = s.data;
      @switch (s.type) {
        @case ('hero') {
          @let img = store.image(d['image']);
          @let pad = d['height'] === 'large' ? 'py-24 sm:py-36' : d['height'] === 'small' ? 'py-10 sm:py-14' : 'py-16 sm:py-24';
          @if (d['layout'] === 'playful') {
            <!-- Playful: warm gradient, huge rounded heading, dark pill button, cut-out photo, scalloped bottom edge -->
            <section class="sf-play-gradient relative text-white" [attr.aria-label]="d['heading'] || store.store()?.name">
              <h1 class="mx-auto max-w-[1100px] px-3 pt-10 text-center text-[clamp(32px,7.5vw,105px)] font-bold uppercase leading-[0.98] tracking-[-0.025em] sm:pt-16">{{ d['heading'] || store.store()?.name }}</h1>
              @if (d['subheading']) {<p class="mx-auto mt-4 max-w-2xl px-4 text-center text-[16px] font-semibold opacity-95">{{ d['subheading'] }}</p>}
              <div class="mt-6 flex flex-wrap justify-center gap-3 px-4">
                <sf-section-link [to]="d['link'] || '/produkty'" [text]="d['cta']" cls="inline-flex rounded-full bg-sf-bg px-7 py-3 text-[13px] font-extrabold uppercase text-sf-text transition hover:opacity-85" />
                <sf-section-link [to]="d['link2']" [text]="d['cta2']" cls="inline-flex rounded-full border-2 border-white px-7 py-3 text-[13px] font-extrabold uppercase text-white transition hover:bg-white/15" />
              </div>
              @if (img) {
                <img [src]="img" alt="" class="relative z-[1] mx-auto mt-4 block h-auto w-full max-w-[1350px] object-contain px-2" [attr.fetchpriority]="first ? 'high' : null" />
              } @else {<div class="h-10"></div>}
              <span class="sf-play-gradient sf-scallops" aria-hidden="true"></span>
            </section>
          } @else if (d['layout'] === 'editorial') {
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
          @if (store.layout() === 'bawiloo') {
            <section class="sf-container mt-16 lg:mt-24" aria-label="Dlaczego warto">
              <ul class="grid grid-cols-2 gap-3 lg:gap-5" [class.md:grid-cols-4]="(d['items']?.length ?? 0) === 4" [class.md:grid-cols-3]="(d['items']?.length ?? 0) === 3">
                @for (u of d['items']; track $index) {
                  <li class="rounded-[20px] border border-sf-line bg-sf-surface px-3 py-6 text-center sm:px-5">
                    <svg [sfPremiumIcon]="u.icon" class="mx-auto h-[74px] w-[74px] sm:h-[90px] sm:w-[90px]"></svg>
                    <h3 class="mt-4 font-[family-name:var(--sf-font)] text-[12px] font-bold uppercase tracking-[0.08em] sm:text-[14px]">{{ u.title }}</h3>
                    @if (u.text) {<p class="mt-1 text-[12px] text-sf-muted sm:text-[13px]">{{ u.text }}</p>}
                  </li>
                }
              </ul>
            </section>
          } @else {
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
        }
        @case ('categories') {
          @let cats = categoriesFor(s);
          @if (d['style'] === 'circles' && (cats.length || store.sampleCategories().length)) {
            <!-- One row of round category pictures; "Więcej" reveals the rest when they do not fit -->
            @let open = expanded().has(s.id);
            @let total = cats.length || store.sampleCategories().length;
            <section class="sf-container mt-20 text-center sm:mt-28" [attr.aria-label]="d['heading'] || 'Kategorie'">
              @if (d['eyebrow']) {<p class="text-[12px] uppercase tracking-[0.2em] text-sf-muted">{{ d['eyebrow'] }}</p>}
              @if (d['heading']) {<h2 class="mb-8 mt-1 text-[26px] font-bold uppercase sm:text-[32px] lg:mb-12 lg:text-[40px]">{{ d['heading'] }}</h2>}
              <ul class="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-6 lg:grid-cols-6" [attr.id]="'cats-' + s.id">
                @for (c of cats; track c.id; let i = $index) {
                  <li [class]="open ? '' : circleHide(i)"><a [routerLink]="['/kategoria', c.slug]" class="group block">
                    <span class="mx-auto flex aspect-square w-full max-w-[170px] items-center justify-center overflow-hidden rounded-full bg-white ring-4 ring-transparent transition group-hover:ring-sf-primary">
                      @if (c.image) {<img [src]="c.image['w400']" alt="" class="size-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" width="400" height="400" />}
                      @else {<span class="sf-display text-[40px] font-semibold text-[#151513] opacity-70" aria-hidden="true">{{ c.name[0] }}</span>}
                    </span>
                    <span class="mt-3 block text-[11px] font-semibold uppercase sm:text-[13px]">{{ c.name }}</span>
                  </a></li>
                }
                @if (!cats.length) {
                  @for (c of store.sampleCategories(); track c.name; let i = $index) {
                    <li [class]="open ? '' : circleHide(i)" [attr.aria-label]="'Przykładowa kategoria: ' + c.name">
                      <span class="mx-auto block aspect-square w-full max-w-[170px] overflow-hidden rounded-full bg-white">
                        @if (c.imageUrl) {<img [src]="c.imageUrl" alt="" class="size-full object-cover" loading="lazy" />}
                      </span>
                      <span class="mt-3 block text-[11px] font-semibold uppercase sm:text-[13px]">{{ c.name }}</span>
                    </li>
                  }
                }
              </ul>
              @if (!cats.length) {<p class="mt-4 text-[12px] text-sf-muted" role="note">Przykładowe kategorie szablonu — widzisz je tylko w podglądzie, dopóki nie dodasz własnych.</p>}
              @if (total > 3) {
                <button type="button" class="mt-10 inline-flex rounded-full border border-sf-text px-6 py-2.5 text-[12px] font-extrabold uppercase transition hover:bg-sf-text hover:text-sf-bg"
                  [class]="open ? '' : moreVisibility(total)" [attr.aria-expanded]="open" [attr.aria-controls]="'cats-' + s.id" (click)="toggle(s.id)">{{ open ? 'Pokaż mniej' : 'Zobacz więcej' }}</button>
              }
            </section>
          } @else if (cats.length) {
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
            @let circles = d['style'] === 'circles';
            <section class="sf-container" [class]="circles ? 'mt-20 text-center sm:mt-28' : 'mt-16'" [attr.aria-label]="d['heading'] || 'Kafelki'">
              @if (d['eyebrow'] || d['heading']) {
                <div [class]="circles ? 'mb-8 lg:mb-12' : 'mb-8'">
                  @if (d['eyebrow']) {<p class="text-[12px] uppercase tracking-[0.2em] text-sf-muted">{{ d['eyebrow'] }}</p>}
                  @if (d['heading']) {<h2 class="mt-1 text-[28px] font-semibold" [class.uppercase]="circles" [class.lg:text-[40px]]="circles">{{ d['heading'] }}</h2>}
                </div>
              }
              @if (circles) {
                <ul class="grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-6" [class.lg:grid-cols-6]="d['items'].length >= 6" [class.lg:grid-cols-4]="d['items'].length === 4">
                  @for (t of d['items']; track $index) {
                    @let timg = store.image(t.image, 'w400');
                    @let l = tileLink(t.link);
                    <li><a [routerLink]="l.path" [queryParams]="l.query" class="group block">
                      <span class="mx-auto block aspect-square w-full max-w-[170px] overflow-hidden rounded-full bg-white ring-4 ring-transparent transition group-hover:ring-sf-primary">
                        @if (timg) {<img [src]="timg" alt="" class="size-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />}
                      </span>
                      <span class="mt-3 block text-[11px] font-semibold uppercase sm:text-[13px]">{{ t.title }}</span>
                    </a></li>
                  }
                </ul>
              } @else {
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
              }
              @if (d['cta']) {
                <div class="mt-10 text-center"><sf-section-link [to]="d['link'] || '/produkty'" [text]="d['cta']" [cls]="circles ? 'inline-flex rounded-full border border-sf-text px-6 py-2.5 text-[12px] font-extrabold uppercase hover:bg-sf-text hover:text-sf-bg' : 'sf-btn-line'" /></div>
              }
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
          @let flower = d['shape'] === 'flower';
          <section class="sf-container mt-16" [class.lg:mt-24]="flower">
            <div class="grid items-center gap-10 md:grid-cols-2" [class.lg:gap-20]="flower">
              @if (flower) {
                <figure class="sf-flower mx-auto w-full max-w-[500px]" [class.md:order-2]="d['imageSide'] === 'right'">
                  @if (img) {<img [src]="img" alt="" class="block size-full object-cover" loading="lazy" />}
                  <!-- the template's own photo has an empty shop sign: it carries the store's name -->
                  @if (d['image'] === 'tpl:bawiloo/about') {<span class="sf-flower-sign" aria-hidden="true">{{ store.store()?.name }}</span>}
                </figure>
              } @else {
                <div class="sf-media aspect-[4/3]" [class.md:order-2]="d['imageSide'] === 'right'">
                  @if (img) {<img [src]="img" alt="" class="size-full object-cover" loading="lazy" />}
                </div>
              }
              <div>
                @if (d['eyebrow']) {<p class="mb-4 text-[12px] font-extrabold uppercase tracking-[0.23em] text-sf-primary"><span aria-hidden="true">✦ </span>{{ d['eyebrow'] }}</p>}
                @if (d['heading']) {<h2 class="font-semibold" [class]="flower ? 'text-[32px] !font-bold uppercase leading-[1.05] tracking-[-0.025em] sm:text-[40px] lg:text-[48px]' : 'text-[26px] tracking-tight'">{{ d['heading'] }}</h2>}
                @if (d['text']) {<p class="mt-3 whitespace-pre-line text-[16px] leading-7 text-sf-muted">{{ d['text'] }}</p>}
                <sf-section-link class="mt-6 inline-block" [to]="d['link']" [text]="d['cta']"
                  [cls]="flower ? 'inline-flex items-center gap-3 rounded-full bg-sf-primary px-6 py-3 text-[14px] font-extrabold text-sf-on-primary hover:opacity-90' : 'sf-btn-outline'" />
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

  /** Expanded "circles" category rows (section ids). */
  protected readonly expanded = signal<Set<string>>(new Set());

  protected toggle(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** One row: 3 circles on phones, 4 on tablets, 6 on desktops; the rest wait behind "Zobacz więcej". */
  protected circleHide(i: number): string {
    return i >= 6 ? 'hidden' : i >= 4 ? 'hidden lg:block' : i >= 3 ? 'hidden sm:block' : '';
  }

  /** The button only where something is hidden at that width. */
  protected moreVisibility(total: number): string {
    return total > 6 ? '' : total > 4 ? 'lg:hidden' : 'sm:hidden';
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
    // "circles" shows every top category (one row + "Zobacz więcej"); the other styles the first 8
    return ids.length ? ids.map((id) => all.find((c) => c.id === id)).filter((c) => !!c)
      : this.store.topCategories().slice(0, s.data['style'] === 'circles' ? 100 : 8);
  }
}
