import { ChangeDetectionStrategy, Component, RESPONSE_INIT, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';
import { BreadcrumbsComponent, Crumb } from '../ui/breadcrumbs';
import { ProductCardComponent } from '../ui/product-card';

const SORTS = [
  { value: 'NEWEST', label: 'Najnowsze' }, { value: 'PRICE_ASC', label: 'Cena: od najniższej' },
  { value: 'PRICE_DESC', label: 'Cena: od najwyższej' }, { value: 'NAME', label: 'Nazwa A–Z' },
];

/** Category listing, all products and search results (route data `mode`). */
@Component({
  selector: 'sf-catalog',
  imports: [RouterLink, ProductCardComponent, BreadcrumbsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      <sf-breadcrumbs [items]="crumbs()" />
      <div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-[30px] font-semibold tracking-tight">{{ heading() }}</h1>
          @if (category()?.description) {<p class="mt-2 max-w-2xl text-sf-muted">{{ category()!.description }}</p>}
        </div>
        <label class="flex items-center gap-2 text-[14px]">
          <span class="text-sf-muted">Sortuj</span>
          <select class="sf-input !h-10 !w-auto" [value]="sort() || 'NEWEST'" (change)="setSort($any($event.target).value)">
            @for (o of sorts; track o.value) {<option [value]="o.value" [selected]="o.value === (sort() || 'NEWEST')">{{ o.label }}</option>}
          </select>
        </label>
      </div>
      @if (subcategories().length) {
        <nav class="mt-5 flex flex-wrap gap-2" aria-label="Podkategorie">
          @for (c of subcategories(); track c.id) {
            <a [routerLink]="['/kategoria', c.slug]" class="sf-btn-outline !h-9 !px-3.5 !text-[13px]">{{ c.name }}</a>
          }
        </nav>
      }

      @if (products.error()) {
        <p class="mt-10 text-sf-muted">Nie znaleziono tej kategorii.</p>
      } @else if (products.hasValue() ? products.value() : null; as page) {
        <p class="mt-6 text-[13px] text-sf-muted" aria-live="polite">{{ countLabel(page.totalItems) }}</p>
        @if (page.items.length) {
          <ul class="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            @for (p of page.items; track p.id) {<li><sf-product-card [product]="p" /></li>}
          </ul>
        } @else {
          <p class="mt-6">{{ mode() === 'search' ? 'Brak produktów pasujących do wyszukiwania.' : 'Brak produktów w tej kategorii.' }}</p>
        }
        @if (page.totalPages > 1) {
          <nav class="mt-10 flex items-center justify-center gap-2" aria-label="Strony">
            @if (page.page > 0) {<a class="sf-btn-outline !h-10" [routerLink]="[]" [queryParams]="{ strona: page.page }" queryParamsHandling="merge" rel="prev">Poprzednia</a>}
            <span class="px-3 text-[14px] text-sf-muted">Strona {{ page.page + 1 }} z {{ page.totalPages }}</span>
            @if (page.page + 1 < page.totalPages) {<a class="sf-btn-outline !h-10" [routerLink]="[]" [queryParams]="{ strona: page.page + 2 }" queryParamsHandling="merge" rel="next">Następna</a>}
          </nav>
        }
      }
    </div>
  `,
})
export class CatalogPage {
  private readonly store = inject(StoreState);
  private readonly api = inject(StorefrontApi);
  private readonly seo = inject(Seo);
  private readonly router = inject(Router);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  protected readonly sorts = SORTS;

  readonly mode = input<'category' | 'all' | 'search'>('all');
  readonly slug = input<string>();
  readonly q = input<string>();
  readonly sort = input<string>();
  readonly strona = input<string>();

  protected readonly page = computed(() => Math.max(0, (Number(this.strona()) || 1) - 1));
  protected readonly category = computed(() => (this.mode() === 'category' && this.slug() ? this.store.category(this.slug()!) : undefined));
  protected readonly subcategories = computed(() => (this.category() ? this.store.children(this.category()!.id) : this.mode() === 'all' ? this.store.topCategories() : []));
  protected readonly heading = computed(() => this.mode() === 'search' ? `Wyniki wyszukiwania: „${this.q() ?? ''}”`
    : this.category()?.name ?? (this.mode() === 'category' ? 'Kategoria' : 'Wszystkie produkty'));
  protected readonly crumbs = computed<Crumb[]>(() => {
    if (this.mode() !== 'category' || !this.slug()) return [{ label: this.mode() === 'search' ? 'Wyszukiwanie' : 'Produkty', link: null }];
    const path = this.store.pathTo(this.slug()!);
    return path.map((c, i) => ({ label: c.name, link: i === path.length - 1 ? null : ['/kategoria', c.slug] }));
  });

  protected readonly products = rxResource({
    params: () => ({ mode: this.mode(), slug: this.slug(), q: this.q(), sort: this.sort(), page: this.page() }),
    stream: ({ params }) => this.api.products({ kategoria: params.mode === 'category' ? params.slug : undefined,
      q: params.mode === 'search' ? params.q : undefined, sort: params.sort, page: params.page }),
  });

  constructor() {
    effect(() => {
      const s = this.store.store();
      if (!s) return;
      const c = this.category();
      if (this.mode() === 'category' && (this.products.error() || (!c && this.slug()))) {
        if (this.response) this.response.status = 404;
        this.seo.set({ title: 'Nie znaleziono kategorii', path: this.router.url, noindex: true }, s.name);
        return;
      }
      const path = this.mode() === 'category' ? `/kategoria/${this.slug()}` : this.mode() === 'search' ? '/szukaj' : '/produkty';
      this.seo.set({
        title: c?.seoTitle || this.heading(), description: c?.seoDescription || c?.description || `${this.heading()} – ${s.name}`,
        path: path + (this.page() > 0 ? `?strona=${this.page() + 1}` : ''), noindex: this.mode() === 'search',
        jsonLd: c ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: this.store.pathTo(c.slug).map((x, i) => ({
          '@type': 'ListItem', position: i + 1, name: x.name, item: this.seo.origin() + '/kategoria/' + x.slug })) }] : [],
      }, s.name);
    });
  }

  protected setSort(value: string): void {
    void this.router.navigate([], { queryParams: { sort: value === 'NEWEST' ? null : value, strona: null }, queryParamsHandling: 'merge' });
  }

  protected countLabel(n: number): string {
    const word = n === 1 ? 'produkt' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'produkty' : 'produktów';
    return `${n} ${word}`;
  }
}
