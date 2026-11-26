import { ChangeDetectionStrategy, Component, PLATFORM_ID, afterNextRender, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { takeLinkToken } from '../core/link-token';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';

/** Newsletter link target: confirms the sign-up (double opt-in) or, with ?wypisz=1, unsubscribes. */
@Component({
  selector: 'sf-newsletter-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sf-container max-w-xl py-16 text-center">
      @switch (state()) {
        @case ('working') {
          <div class="mx-auto max-w-sm space-y-3" role="status" aria-busy="true"><span class="sr-only">Przetwarzanie…</span>
            <span class="sf-shimmer mx-auto block h-7 w-2/3 rounded-[6px]"></span><span class="sf-shimmer mx-auto block h-4 w-full rounded-[4px]"></span></div>
        }
        @case ('confirmed') {
          <h1 class="text-[28px] font-semibold tracking-tight">Zapis potwierdzony</h1>
          <p class="mt-3 text-sf-muted">Dziękujemy! Będziesz otrzymywać nowości i promocje. Wypisać się możesz w każdej chwili linkiem z wiadomości.</p>
        }
        @case ('unsubscribed') {
          <h1 class="text-[28px] font-semibold tracking-tight">Wypisano z newslettera</h1>
          <p class="mt-3 text-sf-muted">Nie będziemy już wysyłać Ci informacji handlowych. Jeśli to pomyłka, możesz zapisać się ponownie na stronie głównej.</p>
        }
        @default {
          <h1 class="text-[28px] font-semibold tracking-tight">Link nie działa</h1>
          <p class="mt-3 text-sf-muted">Link wygasł albo został już użyty. Zapisz się ponownie — wyślemy nową wiadomość.</p>
        }
      }
      <a routerLink="/" class="sf-btn mt-8">Przejdź do sklepu</a>
    </section>
  `,
})
export class NewsletterPage {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  protected readonly state = signal<'working' | 'confirmed' | 'unsubscribed' | 'invalid'>('working');

  constructor() {
    inject(Seo).set({ title: 'Newsletter', description: 'Newsletter sklepu', path: '/newsletter', noindex: true }, this.store.store()?.name ?? '');
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    afterNextRender(() => {
      if (!browser) return;
      const unsubscribe = new URL(window.location.href).searchParams.get('wypisz') === '1';
      const token = takeLinkToken();
      if (!token) {
        this.state.set('invalid');
        return;
      }
      const action = unsubscribe ? this.api.unsubscribeNewsletter(token) : this.api.confirmNewsletter(token);
      firstValueFrom(action).then(() => this.state.set(unsubscribe ? 'unsubscribed' : 'confirmed'), () => this.state.set('invalid'));
    });
  }
}
