import { ChangeDetectionStrategy, Component, RESPONSE_INIT, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CartState } from '../core/cart';
import { StarsComponent } from '../ui/stars';
import { PublicReview } from '../storefront-api';
import { firstValueFrom } from 'rxjs';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { PublicVariant, StorefrontApi } from '../storefront-api';
import { BreadcrumbsComponent, Crumb } from '../ui/breadcrumbs';
import { PriceComponent } from '../ui/price';

@Component({
  selector: 'sf-product',
  imports: [RouterLink, BreadcrumbsComponent, PriceComponent, StarsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      @if (product.error()) {
        <h1 class="text-[26px] font-semibold">Nie znaleziono produktu</h1>
        <p class="mt-3 text-sf-muted">Produkt mógł zostać wycofany ze sprzedaży.</p>
        <a routerLink="/produkty" class="sf-btn mt-6">Zobacz inne produkty</a>
      } @else if (loaded(); as p) {
        <sf-breadcrumbs [items]="crumbs()" />
        <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <div class="sf-media aspect-square">
              @if (activeImage(); as img) {
                <img [src]="img.urls['w1200']" [alt]="img.alt || p.name" class="size-full object-contain" width="1200" height="1200" fetchpriority="high" />
              } @else {
                <span class="flex size-full items-center justify-center text-sf-muted">Brak zdjęcia</span>
              }
            </div>
            @if (p.images.length > 1) {
              <ul class="mt-3 grid grid-cols-5 gap-2" aria-label="Zdjęcia produktu">
                @for (img of p.images; track img.id; let i = $index) {
                  <li><button type="button" class="sf-media block aspect-square w-full border-2" [style.border-color]="i === imageIndex() ? 'var(--sf-primary)' : 'transparent'"
                    [attr.aria-label]="'Zdjęcie ' + (i + 1)" [attr.aria-pressed]="i === imageIndex()" (click)="imageIndex.set(i)">
                    <img [src]="img.urls['w400']" [alt]="img.alt || ''" class="size-full object-cover" loading="lazy" width="400" height="400" /></button></li>
                }
              </ul>
            }
          </div>

          <div>
            @if (p.brand) {<p class="text-[13px] uppercase tracking-wide text-sf-muted">{{ p.brand }}</p>}
            <h1 class="mt-1 text-[30px] font-semibold leading-tight tracking-tight">{{ p.name }}</h1>
              @if (summary(); as r) {
                @if (r.count > 0) {
                  <a href="#opinie" class="mt-2 inline-flex items-center gap-2 text-[14px] text-sf-muted hover:underline">
                    <sf-stars [value]="r.average" />{{ r.average.toLocaleString('pl-PL') }} · {{ reviewsLabel(r.count) }}
                  </a>
                }
              }
            @if (variant(); as v) {
              <sf-price class="mt-4 block" [large]="true" [price]="v.priceMinor" [compareAt]="v.compareAtMinor" [lowest30]="v.lowestPrice30dMinor" [currency]="p.currency" />
              <p class="mt-1 text-[12px] text-sf-muted">Cena zawiera VAT</p>
            }

            @for (o of p.options; track o.name) {
              <fieldset class="mt-6">
                <legend class="text-[14px] font-medium">{{ o.name }}: <span class="text-sf-muted">{{ selection()[o.name] }}</span></legend>
                <div class="mt-2 flex flex-wrap gap-2">
                  @for (value of o.values; track value) {
                    <button type="button" class="min-w-12 border px-3.5 py-2 text-[14px] transition"
                      [style.border-radius]="'var(--sf-radius)'"
                      [style.border-color]="selection()[o.name] === value ? 'var(--sf-text)' : 'color-mix(in srgb, var(--sf-text) 12%, var(--sf-bg))'"
                      [style.background]="selection()[o.name] === value ? 'var(--sf-text)' : 'var(--sf-surface)'"
                      [style.color]="selection()[o.name] === value ? 'var(--sf-bg)' : 'var(--sf-text)'"
                      [class.opacity-45]="!optionAvailable(o.name, value)"
                      [attr.aria-pressed]="selection()[o.name] === value" (click)="choose(o.name, value)">{{ value }}</button>
                  }
                </div>
              </fieldset>
            }

            <div class="mt-6 text-[14px]" aria-live="polite">
              @if (!variant()) {
                <p class="text-sf-muted">Wybierz wariant.</p>
              } @else if (!variant()!.available) {
                <p class="font-medium text-sf-danger">Chwilowo niedostępny</p>
              } @else if (variant()!.lowStock) {
                <p class="font-medium text-sf-success">Dostępny — ostatnie sztuki</p>
              } @else {
                <p class="font-medium text-sf-success">Dostępny</p>
              }
            </div>

            <div class="mt-5 flex gap-3">
              <label class="sr-only" for="qty">Ilość</label>
              <input id="qty" type="number" min="1" max="99" class="sf-input !w-20 text-center" [value]="quantity()"
                (change)="quantity.set(clamp($any($event.target).value))" />
              <button type="button" class="sf-btn flex-1" [disabled]="!variant()?.available || cart.busy()" (click)="add()">
                {{ cart.busy() ? 'Dodawanie…' : 'Dodaj do koszyka' }}
              </button>
            </div>
            @if (message(); as m) {
              <p class="mt-3 text-[14px]" [class.text-sf-danger]="m.error" role="status">{{ m.text }}
                @if (!m.error) { <a routerLink="/koszyk" class="sf-link">Przejdź do koszyka</a>}</p>
            }

            @if (p.description) {
              <section class="mt-10 border-t border-sf-line pt-6" aria-labelledby="desc">
                <h2 id="desc" class="text-[17px] font-semibold">Opis</h2>
                <p class="mt-3 whitespace-pre-line leading-relaxed">{{ p.description }}</p>
              </section>
            }
            @if (variant()?.sku) {<p class="mt-6 text-[12px] text-sf-muted">Kod produktu: {{ variant()!.sku }}</p>}
          </div>
        </div>

        <section id="opinie" class="mt-14 scroll-mt-24 border-t border-sf-line pt-8" aria-labelledby="reviews-h">
          <h2 id="reviews-h" class="text-[22px] font-semibold tracking-tight">Opinie klientów</h2>
          <p class="mt-2 max-w-2xl text-[13px] text-sf-muted">Opinie mogą wystawiać wyłącznie klienci, którzy kupili ten produkt w naszym sklepie —
            weryfikujemy to na podstawie zamówienia (link do opinii wysyłamy po jego realizacji). Opinie są publikowane po sprawdzeniu przez sklep.</p>
          @if (summary(); as r) {
            @if (r.count > 0) {
              <div class="mt-6 grid gap-8 md:grid-cols-[240px_1fr]">
                <div>
                  <p class="text-[40px] font-semibold leading-none">{{ r.average.toLocaleString('pl-PL') }}</p>
                  <sf-stars class="mt-2" [value]="r.average" [size]="20" />
                  <p class="mt-1 text-[13px] text-sf-muted">{{ reviewsLabel(r.count) }}</p>
                  <ul class="mt-4 space-y-1.5" aria-label="Rozkład ocen">
                    @for (stars of [5, 4, 3, 2, 1]; track stars) {
                      <li class="flex items-center gap-2 text-[12px]">
                        <span class="w-3 text-right tabular-nums">{{ stars }}</span>
                        <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-sf-soft"><span class="block h-full rounded-full bg-[#F5A524]" [style.width.%]="r.distribution[stars - 1] * 100 / r.count"></span></span>
                        <span class="w-6 text-sf-muted tabular-nums">{{ r.distribution[stars - 1] }}</span>
                      </li>
                    }
                  </ul>
                </div>
                <ul class="space-y-6">
                  @for (rv of reviewList(); track $index) {
                    <li class="border-b border-sf-line pb-6 last:border-b-0">
                      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <sf-stars [value]="rv.rating" />
                        <span class="font-medium">{{ rv.authorName }}</span>
                        <span class="text-[12px] text-sf-success">Zweryfikowany zakup</span>
                        <time class="text-[12px] text-sf-muted" [attr.datetime]="rv.createdAt">{{ date(rv.createdAt) }}</time>
                      </div>
                      @if (rv.body) {<p class="mt-2 whitespace-pre-line leading-relaxed">{{ rv.body }}</p>}
                      @if (rv.reply) {
                        <div class="mt-3 rounded-[10px] bg-sf-soft px-4 py-3 text-[14px]">
                          <p class="text-[12px] font-semibold">Odpowiedź sklepu</p>
                          <p class="mt-1 whitespace-pre-line">{{ rv.reply }}</p>
                        </div>
                      }
                    </li>
                  }
                  @if (moreReviews()) {
                    <li><button type="button" class="sf-btn-outline" [disabled]="loadingMore()" (click)="loadMore()">Pokaż więcej opinii</button></li>
                  }
                </ul>
              </div>
            } @else {
              <p class="mt-5">Ten produkt nie ma jeszcze opinii.</p>
            }
          }
        </section>
      }
    </div>
  `,
})
export class ProductPage {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly seo = inject(Seo);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  protected readonly cart = inject(CartState);

  readonly slug = input.required<string>();
  protected readonly product = rxResource({ params: () => this.slug(), stream: ({ params }) => this.api.product(params) });
  /** resource.value() throws while the resource is in error state; read through this instead. */
  protected readonly loaded = computed(() => (this.product.hasValue() ? this.product.value() : undefined));
  protected readonly reviews = rxResource({ params: () => this.slug(), stream: ({ params }) => this.api.productReviews(params, 0) });
  protected readonly summary = computed(() => (this.reviews.hasValue() ? this.reviews.value().summary : undefined));
  private readonly extraReviews = signal<PublicReview[]>([]);
  private readonly reviewPage = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly reviewList = computed(() => [...(this.reviews.hasValue() ? this.reviews.value().reviews.items : []), ...this.extraReviews()]);
  protected readonly moreReviews = computed(() => this.reviews.hasValue() && this.reviewPage() + 1 < this.reviews.value().reviews.totalPages);
  protected readonly selection = signal<Record<string, string>>({});
  protected readonly imageIndex = signal(0);
  protected readonly quantity = signal(1);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);

  protected readonly variant = computed<PublicVariant | undefined>(() => {
    const p = this.loaded();
    if (!p) return undefined;
    if (!p.options.length) return p.variants[0];
    const sel = this.selection();
    return p.variants.find((v) => p.options.every((o) => v.optionValues[o.name] === sel[o.name]));
  });
  protected readonly activeImage = computed(() => this.loaded()?.images[this.imageIndex()] ?? this.loaded()?.images[0]);
  protected readonly crumbs = computed<Crumb[]>(() => {
    const p = this.loaded();
    if (!p) return [];
    return [...p.breadcrumbs.map((c) => ({ label: c.name, link: ['/kategoria', c.slug] as unknown[] })), { label: p.name, link: null }];
  });

  constructor() {
    // Preselect the first available variant.
    effect(() => {
      const p = this.loaded();
      if (!p || !p.options.length) return;
      const first = p.variants.find((v) => v.available) ?? p.variants[0];
      if (first) this.selection.set({ ...first.optionValues });
      this.imageIndex.set(0);
    });
    // A different product starts again from the first page of reviews.
    effect(() => {
      this.slug();
      untracked(() => {
        this.extraReviews.set([]);
        this.reviewPage.set(0);
      });
    });
    effect(() => {
      const s = this.store.store();
      if (!s) return;
      if (this.product.error()) {
        if (this.response) this.response.status = 404;
        this.seo.set({ title: 'Nie znaleziono produktu', path: '/produkt/' + this.slug(), noindex: true }, s.name);
        return;
      }
      const p = this.loaded();
      if (!p) return;
      const r = this.summary();
      const shown = this.reviews.hasValue() ? this.reviews.value().reviews.items.slice(0, 5) : [];
      const origin = this.seo.origin();
      const image = p.images[0]?.urls['w1200'] ?? null;
      this.seo.set({
        title: p.seoTitle || p.name, description: p.seoDescription || p.description || p.name, path: '/produkt/' + p.slug, image, type: 'product',
        jsonLd: [{
          '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: (p.description ?? '').slice(0, 5000),
          ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
          ...(image ? { image: p.images.map((i) => origin + i.urls['w1200']) } : {}),
          ...(r && r.count > 0 ? {
            aggregateRating: { '@type': 'AggregateRating', ratingValue: r.average, reviewCount: r.count, bestRating: 5, worstRating: 1 },
            review: shown.map((rv) => ({ '@type': 'Review', author: { '@type': 'Person', name: rv.authorName }, datePublished: rv.createdAt.slice(0, 10),
              reviewRating: { '@type': 'Rating', ratingValue: rv.rating, bestRating: 5 }, ...(rv.body ? { reviewBody: rv.body } : {}) })),
          } : {}),
          offers: p.variants.map((v) => ({
            '@type': 'Offer', price: (v.priceMinor / 100).toFixed(2), priceCurrency: p.currency, ...(v.sku ? { sku: v.sku } : {}),
            availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: origin + '/produkt/' + p.slug,
          })),
        }, ...(p.breadcrumbs.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          ...p.breadcrumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: origin + '/kategoria/' + c.slug })),
          { '@type': 'ListItem', position: p.breadcrumbs.length + 1, name: p.name }] }] : [])],
      }, s.name);
    });
  }

  protected async loadMore(): Promise<void> {
    this.loadingMore.set(true);
    try {
      const next = this.reviewPage() + 1;
      const page = await firstValueFrom(this.api.productReviews(this.slug(), next));
      this.extraReviews.update((l) => [...l, ...page.reviews.items]);
      this.reviewPage.set(next);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected reviewsLabel(n: number): string {
    const mod10 = n % 10, mod100 = n % 100;
    return n + (n === 1 ? ' opinia' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? ' opinie' : ' opinii');
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  }

  protected choose(option: string, value: string): void {
    this.selection.update((s) => ({ ...s, [option]: value }));
    this.message.set(null);
  }

  /** Whether some available variant has this value together with the other current choices. */
  protected optionAvailable(option: string, value: string): boolean {
    const p = this.loaded();
    if (!p) return true;
    const sel = { ...this.selection(), [option]: value };
    return p.variants.some((v) => v.available && p.options.every((o) => o.name === option ? v.optionValues[o.name] === value : v.optionValues[o.name] === sel[o.name]));
  }

  protected clamp(value: string): number {
    return Math.min(99, Math.max(1, Math.round(Number(value) || 1)));
  }

  protected async add(): Promise<void> {
    const v = this.variant();
    if (!v) return;
    try {
      await this.cart.add(v.id, this.quantity());
      this.message.set({ text: 'Dodano do koszyka.', error: false });
    } catch (e: unknown) {
      const err = e as { error?: { detail?: string } };
      this.message.set({ text: err.error?.detail ?? 'Nie udało się dodać produktu. Spróbuj ponownie.', error: true });
    }
  }
}
