import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerSession } from '../../core/account';
import { StoreState } from '../../core/store-state';
import { SectionNewsletterCompactComponent } from '../../ui/sections';

const SOCIALS = [
  { key: 'instagram', label: 'Instagram', icon: 'M4 4h16v16H4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 6.5h.01' },
  { key: 'facebook', label: 'Facebook', icon: 'M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z' },
  { key: 'tiktok', label: 'TikTok', icon: 'M14 4v10a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.5 2.5 4 5 4' },
  { key: 'youtube', label: 'YouTube', icon: 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8ZM10 9l5 3-5 3V9Z' },
];

/** Bawiloo footer: dark, golden wordmark, shop / account / help columns, newsletter and seller details. */
@Component({
  selector: 'sf-bawiloo-footer',
  imports: [RouterLink, SectionNewsletterCompactComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = store.store()!;
    @let ts = store.settings();
    <footer class="border-t border-sf-line px-5 pb-6 pt-14 text-[14px] sm:px-[6%]" style="background: color-mix(in srgb, var(--sf-bg) 80%, #000)">
      <div class="mx-auto grid max-w-[1500px] gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <a routerLink="/" class="sf-display text-[36px] font-bold text-sf-primary">{{ s.name }}</a>
          @if (ts['footerNote']) {<p class="mt-4 max-w-xs text-sf-muted">{{ ts['footerNote'] }}</p>}
          @if (socials().length) {
            <ul class="mt-5 flex gap-2" aria-label="Media społecznościowe">
              @for (so of socials(); track so.key) {
                <li><a [href]="so.url" target="_blank" rel="noopener" class="flex size-10 items-center justify-center rounded-full border border-sf-line text-sf-primary hover:border-sf-primary" [attr.aria-label]="so.label">
                  <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="so.icon" /></svg></a></li>
              }
            </ul>
          }
        </div>
        <div>
          <h2 class="font-[family-name:var(--sf-font)] text-[14px] font-extrabold uppercase">Sklep</h2>
          <ul class="mt-4 grid gap-2 text-sf-muted">
            <li><a routerLink="/produkty" class="hover:text-sf-text">Wszystkie zabawki</a></li>
            @for (c of store.topCategories().slice(0, 5); track c.id) {<li><a [routerLink]="['/kategoria', c.slug]" class="hover:text-sf-text">{{ c.name }}</a></li>}
            <li><a routerLink="/produkty" [queryParams]="{ promocje: 'tak' }" class="hover:text-sf-text">Promocje</a></li>
          </ul>
        </div>
        <div>
          <h2 class="font-[family-name:var(--sf-font)] text-[14px] font-extrabold uppercase">Twoje konto</h2>
          <ul class="mt-4 grid gap-2 text-sf-muted">
            <li><a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="hover:text-sf-text">Moje konto</a></li>
            <li><a routerLink="/koszyk" class="hover:text-sf-text">Koszyk</a></li>
            <li><a routerLink="/ulubione" class="hover:text-sf-text">Ulubione</a></li>
            @for (l of s.footerLinks; track l.path) {<li><a [routerLink]="l.path" class="hover:text-sf-text">{{ l.title }}</a></li>}
            @if (s.blog) {<li><a routerLink="/blog" class="hover:text-sf-text">Blog</a></li>}
          </ul>
        </div>
        <div>
          @if (ts['footerNewsletter'] !== 'no') {
            <h2 class="font-[family-name:var(--sf-font)] text-[14px] font-extrabold uppercase">Newsletter</h2>
            <p class="mb-3 mt-4 text-sf-muted">Nowości i promocje prosto na Twój e-mail.</p>
            <sf-section-newsletter-compact />
          }
          @if (s.seller; as seller) {
            <address class="mt-6 space-y-1 text-[13px] not-italic text-sf-muted">
              @if (seller.companyName) {<p class="font-semibold text-sf-text">{{ seller.companyName }}</p>}
              @if (seller.address) {<p>{{ seller.address }}</p>}
              @if (seller.taxId) {<p>NIP {{ seller.taxId }}</p>}
              @if (seller.email) {<p><a class="hover:text-sf-text" [href]="'mailto:' + seller.email">{{ seller.email }}</a></p>}
              @if (seller.phone) {<p><a class="hover:text-sf-text" [href]="'tel:' + seller.phone">{{ seller.phone }}</a></p>}
            </address>
          }
        </div>
      </div>
      <div class="mx-auto mt-12 flex max-w-[1500px] flex-wrap justify-between gap-3 border-t border-sf-line pt-5 text-[12px] text-sf-muted">
        <span>© {{ year }} {{ s.name }}. Wszystkie prawa zastrzeżone.</span><span>Sklep działa na platformie Shopivo</span>
      </div>
    </footer>
  `,
})
export class BawilooFooterComponent {
  protected readonly store = inject(StoreState);
  protected readonly customer = inject(CustomerSession);
  protected readonly year = new Date().getFullYear();
  protected readonly socials = computed(() => {
    const s = this.store.settings();
    return SOCIALS.filter((x) => s[x.key]).map((x) => ({ ...x, url: s[x.key] }));
  });
}
