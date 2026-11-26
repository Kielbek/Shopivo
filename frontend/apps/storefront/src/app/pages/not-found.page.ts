import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';

@Component({
  selector: 'sf-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-20 text-center">
      <h1 class="text-[30px] font-semibold">Nie znaleziono strony</h1>
      <p class="mt-3 text-sf-muted">Strona mogła zostać przeniesiona lub usunięta.</p>
      <a routerLink="/" class="sf-btn mt-8">Strona główna</a>
    </div>
  `,
})
export class NotFoundPage {
  constructor() {
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) response.status = 404;
    inject(Seo).set({ title: 'Nie znaleziono strony', path: '/', noindex: true }, inject(StoreState).store()?.name ?? '');
  }
}
