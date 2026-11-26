import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Seo } from '../core/seo';
import { takeLinkToken } from '../core/link-token';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';

interface Draft { rating: number; body: string; sent: boolean; sending: boolean; error: string | null; }

/**
 * Review form opened from the e-mail link (/opinia?t=…). The token is removed from the address bar right away and kept
 * only in memory. Rendered in the browser only (the token never reaches server logs of the SSR layer).
 */
@Component({
  selector: 'sf-review',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container max-w-[760px] py-10">
      <h1 class="text-[30px] font-semibold tracking-tight">Oceń zakupy</h1>
      @if (!token) {
        <p class="mt-4">Ten link jest niepełny. Otwórz go ponownie z wiadomości e-mail.</p>
      } @else if (invitation.error(); as e) {
        <p class="mt-4" role="alert">{{ expired() ? 'Link do wystawienia opinii wygasł.' : 'Link do wystawienia opinii jest nieprawidłowy.' }}</p>
        <a routerLink="/" class="sf-btn mt-6">Strona główna</a>
      } @else if (inv(); as i) {
        <p class="mt-2 text-sf-muted">Zamówienie nr {{ i.orderNumber }}. Opinie publikujemy po sprawdzeniu przez sklep, z oznaczeniem „Zweryfikowany zakup”.</p>
        <div class="mt-6 max-w-sm">
          <label class="sf-label" for="author">Podpis pod opinią</label>
          <input id="author" name="author" class="sf-input" maxlength="60" [ngModel]="author()" (ngModelChange)="author.set($event)" />
          <p class="mt-1 text-[12px] text-sf-muted">Nie publikujemy Twojego adresu e-mail ani pełnego nazwiska, chyba że je tu wpiszesz.</p>
        </div>
        <ul class="mt-8 space-y-6">
          @for (item of i.items; track item.productId) {
            <li class="sf-panel p-5">
              <h2 class="text-[18px] font-semibold">{{ item.name }}</h2>
              @if (item.reviewed || drafts()[item.productId]?.sent) {
                <p class="mt-2 text-sf-success" role="status">Dziękujemy — opinia została przesłana.</p>
              } @else {
                @let d = draft(item.productId);
                <form class="mt-3" (ngSubmit)="send(item.productId)">
                  <fieldset>
                    <legend class="sf-label">Ocena</legend>
                    <div class="flex gap-1" role="radiogroup">
                      @for (n of [1, 2, 3, 4, 5]; track n) {
                        <label class="cursor-pointer">
                          <input type="radio" class="peer sr-only" [name]="'r-' + item.productId" [value]="n" [checked]="d.rating === n" (change)="setRating(item.productId, n)" [attr.aria-label]="n + ' na 5'" />
                          <svg viewBox="0 0 20 20" class="size-8 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2" aria-hidden="true">
                            <path [attr.fill]="d.rating >= n ? '#F5A524' : '#D9DCE3'" d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" />
                          </svg>
                        </label>
                      }
                    </div>
                  </fieldset>
                  <label class="sf-label mt-4" [for]="'b-' + item.productId">Opinia <span class="font-normal text-sf-muted">(opcjonalnie)</span></label>
                  <textarea [id]="'b-' + item.productId" [name]="'b-' + item.productId" class="sf-input !h-28 py-2" maxlength="2000"
                    [ngModel]="d.body" (ngModelChange)="setBody(item.productId, $event)"></textarea>
                  @if (d.error) {<p class="mt-2 text-[14px] text-sf-danger" role="alert">{{ d.error }}</p>}
                  <button type="submit" class="sf-btn mt-4" [disabled]="d.sending">Wyślij opinię</button>
                </form>
              }
            </li>
          }
        </ul>
      } @else {
        <div class="mt-6 space-y-3" role="status" aria-busy="true"><span class="sr-only">Wczytywanie…</span><span class="sf-shimmer block h-5 w-2/3 rounded-[6px]"></span><span class="sf-shimmer block h-20 rounded-[10px]"></span><span class="sf-shimmer block h-20 rounded-[10px]"></span></div>
      }
    </div>
  `,
})
export class ReviewPage {
  private readonly api = inject(StorefrontApi);
  protected readonly token: string | null;
  protected readonly author = signal('');
  protected readonly drafts = signal<Record<string, Draft>>({});
  protected readonly invitation = rxResource({
    params: () => this.token ?? undefined,
    stream: ({ params }) => this.api.reviewInvitation(params),
  });
  protected readonly inv = computed(() => (this.invitation.hasValue() ? this.invitation.value() : undefined));
  protected readonly expired = computed(() => (this.invitation.error() as HttpErrorResponse | undefined)?.status === 410);

  constructor() {
    this.token = takeLinkToken();
    const store = inject(StoreState).store();
    inject(Seo).set({ title: 'Oceń zakupy', path: '/opinia', noindex: true }, store?.name ?? '');
    effect(() => {
      const i = this.inv();
      if (i && !untracked(this.author)) this.author.set(i.suggestedAuthor);
    });
  }

  protected draft(id: string): Draft {
    return this.drafts()[id] ?? { rating: 0, body: '', sent: false, sending: false, error: null };
  }

  private patch(id: string, change: Partial<Draft>): void {
    this.drafts.update((all) => ({ ...all, [id]: { ...this.draft(id), ...change } }));
  }

  protected setRating(id: string, rating: number): void {
    this.patch(id, { rating, error: null });
  }

  protected setBody(id: string, body: string): void {
    this.patch(id, { body });
  }

  protected async send(id: string): Promise<void> {
    const d = this.draft(id);
    if (!d.rating) {
      this.patch(id, { error: 'Wybierz ocenę od 1 do 5 gwiazdek.' });
      return;
    }
    this.patch(id, { sending: true, error: null });
    try {
      await firstValueFrom(this.api.submitReview(this.token!, { productId: id, rating: d.rating, body: d.body.trim() || null,
        authorName: this.author().trim() || this.inv()?.suggestedAuthor || null }));
      this.patch(id, { sent: true, sending: false });
    } catch (e) {
      const detail = (e as HttpErrorResponse).error?.detail;
      this.patch(id, { sending: false, error: typeof detail === 'string' ? detail : 'Nie udało się wysłać opinii. Spróbuj ponownie.' });
    }
  }
}
