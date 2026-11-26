import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';
import { ProductCardComponent } from '../ui/product-card';

@Component({
  selector: 'sf-home',
  imports: [RouterLink, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = store.settings();
    <section [class]="heroClass()">
      <div class="sf-container" [class]="layout() === 'split' ? 'grid items-center gap-8 py-14 sm:py-20 md:grid-cols-2' : 'py-16 text-center sm:py-24'">
        <div [class.mx-auto]="layout() !== 'split'" [class.max-w-2xl]="layout() !== 'split'">
          <h1 class="text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[48px]">{{ s['heroTitle'] || store.store()?.name }}</h1>
          @if (s['heroSubtitle']) {<p class="mt-4 text-[17px] opacity-80">{{ s['heroSubtitle'] }}</p>}
          <a class="sf-btn mt-8" [routerLink]="s['heroCategory'] ? ['/kategoria', s['heroCategory']] : ['/produkty']">{{ s['heroCta'] || 'Zobacz produkty' }}</a>
        </div>
        @if (layout() === 'split') {
          <div class="grid grid-cols-2 gap-3" aria-hidden="true">
            @for (p of featuredImages(); track p.id) {
              <div class="sf-media aspect-square"><img [src]="p.imageUrl" alt="" class="size-full object-cover" width="400" height="400" /></div>
            }
          </div>
        }
      </div>
    </section>

    @if (store.topCategories().length) {
      <section class="sf-container mt-12" aria-labelledby="cats">
        <h2 id="cats" class="text-[22px] font-semibold tracking-tight">Kategorie</h2>
        <ul class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          @for (c of store.topCategories(); track c.id) {
            <li><a [routerLink]="['/kategoria', c.slug]" class="sf-panel flex h-full items-center justify-between gap-2 px-4 py-4 font-medium hover:border-sf-text">
              {{ c.name }}<span aria-hidden="true">→</span></a></li>
          }
        </ul>
      </section>
    }

    <section class="sf-container mt-12" aria-labelledby="new">
      <div class="flex items-end justify-between gap-4">
        <h2 id="new" class="text-[22px] font-semibold tracking-tight">Nowości</h2>
        <a routerLink="/produkty" class="text-[14px] font-medium hover:underline">Wszystkie produkty →</a>
      </div>
      @if (products.hasValue() ? products.value() : null; as page) {
        @if (page.items.length) {
          <ul class="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            @for (p of page.items; track p.id) {<li><sf-product-card [product]="p" /></li>}
          </ul>
        } @else {
          <p class="mt-5 text-sf-muted">Produkty pojawią się wkrótce.</p>
        }
      }
    </section>
  `,
})
export class HomePage {
  protected readonly store = inject(StoreState);
  private readonly api = inject(StorefrontApi);
  private readonly seo = inject(Seo);
  protected readonly products = rxResource({ stream: () => this.api.products({ size: 8, sort: 'NEWEST' }) });
  protected readonly layout = computed(() => this.store.settings()['heroLayout'] ?? 'centered');
  protected readonly heroClass = computed(() => this.layout() === 'banner'
    ? 'bg-sf-primary text-sf-on-primary' : this.layout() === 'split' ? 'bg-sf-surface' : 'bg-sf-soft');
  protected readonly featuredImages = computed(() => (this.products.hasValue() ? this.products.value().items : []).filter((p) => p.imageUrl).slice(0, 4));

  constructor() {
    effect(() => {
      const s = this.store.store();
      if (!s) return;
      const settings = this.store.settings();
      this.seo.set({
        title: s.name, description: settings['heroSubtitle'] || `Sklep internetowy ${s.name}.`, path: '/',
        jsonLd: [{
          '@context': 'https://schema.org', '@type': 'Organization', name: s.seller?.companyName || s.name, url: this.seo.origin() + '/',
          ...(s.seller?.email ? { email: s.seller.email } : {}), ...(s.seller?.taxId ? { vatID: 'PL' + s.seller.taxId } : {}),
        }, { '@context': 'https://schema.org', '@type': 'WebSite', name: s.name, url: this.seo.origin() + '/',
          potentialAction: { '@type': 'SearchAction', target: this.seo.origin() + '/szukaj?q={q}', 'query-input': 'required name=q' } }],
      }, s.name);
    });
  }
}
