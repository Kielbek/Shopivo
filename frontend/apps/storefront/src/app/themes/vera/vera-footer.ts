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

/** VÉRA footer: brand column, shop links, customer service (the store's own pages), newsletter and seller details. */
@Component({
  selector: 'sf-vera-footer',
  imports: [RouterLink, SectionNewsletterCompactComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = store.store()!;
    @let ts = store.settings();
    <footer class="mt-16 border-t border-sf-line bg-sf-surface text-[14px] text-sf-muted">
      <div class="sf-container grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <a routerLink="/" class="sf-display text-[24px] font-bold uppercase tracking-[0.18em] text-sf-text">{{ s.name }}<span class="text-sf-accent">.</span></a>
          @if (ts['footerNote']) {<p class="mt-4 leading-relaxed">{{ ts['footerNote'] }}</p>}
          @if (socials().length) {
            <ul class="mt-5 flex gap-2" aria-label="Media społecznościowe">
              @for (so of socials(); track so.key) {
                <li><a [href]="so.url" target="_blank" rel="noopener" class="flex size-10 items-center justify-center rounded-full border border-sf-line text-sf-text hover:border-sf-text" [attr.aria-label]="so.label">
                  <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="so.icon" /></svg></a></li>
              }
            </ul>
          }
        </div>
        <div>
          <h2 class="mb-4 font-[family-name:var(--sf-font)] text-[12px] font-semibold uppercase tracking-wider text-sf-text">Zakupy</h2>
          <ul class="space-y-2.5">
            <li><a routerLink="/produkty" class="hover:text-sf-text">Wszystkie produkty</a></li>
            @for (c of store.topCategories().slice(0, 6); track c.id) {<li><a [routerLink]="['/kategoria', c.slug]" class="hover:text-sf-text">{{ c.name }}</a></li>}
            <li><a routerLink="/produkty" [queryParams]="{ promocje: 'tak' }" class="hover:text-sf-text">Promocje</a></li>
          </ul>
        </div>
        <div>
          <h2 class="mb-4 font-[family-name:var(--sf-font)] text-[12px] font-semibold uppercase tracking-wider text-sf-text">Obsługa klienta</h2>
          <ul class="space-y-2.5">
            <li><a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="hover:text-sf-text">{{ customer.account() ? 'Moje konto' : 'Logowanie / rejestracja' }}</a></li>
            @for (l of s.footerLinks; track l.path) {<li><a [routerLink]="l.path" class="hover:text-sf-text">{{ l.title }}</a></li>}
            @if (s.blog) {<li><a routerLink="/blog" class="hover:text-sf-text">Blog</a></li>}
          </ul>
        </div>
        <div>
          @if (ts['footerNewsletter'] !== 'no') {
            <h2 class="mb-4 font-[family-name:var(--sf-font)] text-[12px] font-semibold uppercase tracking-wider text-sf-text">Newsletter</h2>
            <p class="mb-3">Nowości i promocje prosto na Twój e-mail.</p>
            <sf-section-newsletter-compact />
          }
          @if (s.seller; as seller) {
            <address class="mt-6 space-y-1 text-[13px] not-italic">
              @if (seller.companyName) {<p class="font-medium text-sf-text">{{ seller.companyName }}</p>}
              @if (seller.address) {<p>{{ seller.address }}</p>}
              @if (seller.taxId) {<p>NIP {{ seller.taxId }}</p>}
              @if (seller.email) {<p><a class="hover:text-sf-text" [href]="'mailto:' + seller.email">{{ seller.email }}</a></p>}
              @if (seller.phone) {<p><a class="hover:text-sf-text" [href]="'tel:' + seller.phone">{{ seller.phone }}</a></p>}
            </address>
          }
        </div>
      </div>
      <div class="sf-container flex flex-col items-center justify-between gap-2 border-t border-sf-line py-6 text-[12px] sm:flex-row">
        <p>© {{ year }} {{ s.name }}. Wszystkie prawa zastrzeżone.</p>
        <p>Sklep działa na platformie Shopivo</p>
      </div>
    </footer>
  `,
})
export class VeraFooterComponent {
  protected readonly store = inject(StoreState);
  protected readonly customer = inject(CustomerSession);
  protected readonly year = new Date().getFullYear();
  protected readonly socials = computed(() => {
    const s = this.store.settings();
    return SOCIALS.filter((x) => s[x.key]).map((x) => ({ ...x, url: s[x.key] }));
  });
}
