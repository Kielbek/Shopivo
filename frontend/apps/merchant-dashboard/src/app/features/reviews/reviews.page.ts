import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, ReviewsApi } from '@shopivo/api-client';
import { Review, ReviewStatus } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, EmptyStateComponent, LoadingComponent, PageHeaderComponent,
  TabOption, TabsComponent, ToastService,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const STATUS_LABEL: Record<ReviewStatus, string> = { PENDING: 'Do moderacji', APPROVED: 'Opublikowana', REJECTED: 'Odrzucona' };

/** Moderation of product reviews written by verified buyers. */
@Component({
  selector: 'sv-reviews-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, TabsComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Opinie" description="Opinie wystawiają wyłącznie klienci, którzy kupili produkt — zaproszenie wysyłamy e-mailem po zrealizowaniu zamówienia. W sklepie pojawiają się po Twojej akceptacji." />
    <sv-alert tone="info" class="mt-5">Odrzucaj tylko opinie niezgodne z zasadami (np. obraźliwe, niedotyczące produktu, z danymi osobowymi).
      Ukrywanie opinii tylko dlatego, że są negatywne, jest niedozwoloną praktyką rynkową.</sv-alert>
    <sv-tabs class="mt-5" label="Status opinii" [tabs]="tabs" [active]="tab()" (activeChange)="setTab($any($event))" />
    <sv-card class="mt-5" [flush]="true">
      <div role="tabpanel" [id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()">
        @if (reviews.isLoading() && !reviews.value()) {
          <sv-loading variant="table" [rows]="6" />
        } @else if (reviews.error()) {
          <div class="p-5"><sv-alert tone="error">Nie udało się wczytać opinii.</sv-alert></div>
        } @else if (!reviews.value()?.items?.length) {
          <sv-empty-state icon="star" [title]="tab() === 'PENDING' ? 'Brak opinii do moderacji' : 'Brak opinii'"
            description="Gdy klient oceni zakupiony produkt, opinia pojawi się tutaj." />
        } @else {
          <ul>
            @for (r of reviews.value()!.items; track r.id) {
              <li class="border-b border-line px-5 py-4 last:border-b-0">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span class="text-[15px] tracking-[2px] text-[#F5A524]" [attr.aria-label]="'Ocena ' + r.rating + ' na 5'">{{ '★★★★★'.slice(0, r.rating) }}<span class="text-[#D9DCE3]">{{ '★★★★★'.slice(r.rating) }}</span></span>
                  <span class="font-medium text-ink">{{ r.authorName }}</span>
                  <span class="text-[12px] text-ink-muted">{{ r.createdAt | svDate }}</span>
                  <sv-badge [tone]="r.status === 'APPROVED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'neutral'" class="ml-auto">{{ statusLabel[r.status] }}</sv-badge>
                </div>
                <p class="mt-1 text-[12px] text-ink-muted">{{ r.productName ?? 'Produkt usunięty' }} ·
                  <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia', r.orderId]">zamówienie {{ r.orderNumber }}</a></p>
                @if (r.body) {<p class="mt-2 whitespace-pre-line text-[14px] text-ink">{{ r.body }}</p>} @else {<p class="mt-2 text-[13px] text-ink-muted">Sama ocena, bez komentarza.</p>}
                @if (r.reply && replying() !== r.id) {
                  <div class="mt-3 rounded-[8px] bg-canvas px-3 py-2 text-[13px]"><p class="text-[12px] font-medium text-ink-muted">Twoja odpowiedź</p><p class="whitespace-pre-line">{{ r.reply }}</p></div>
                }
                @if (replying() === r.id) {
                  <form class="mt-3" (ngSubmit)="saveReply(r)">
                    <label class="sr-only" [for]="'reply-' + r.id">Odpowiedź</label>
                    <textarea [id]="'reply-' + r.id" name="reply" class="sv-input !h-24 py-2" maxlength="2000" [(ngModel)]="replyText"></textarea>
                    <div class="mt-2 flex gap-2">
                      <button sv-button size="sm" type="submit" [loading]="busy() === r.id">Zapisz odpowiedź</button>
                      <button sv-button size="sm" variant="secondary" type="button" (click)="replying.set(null)">Anuluj</button>
                    </div>
                  </form>
                }
                @if (canWrite && replying() !== r.id) {
                  <div class="mt-3 flex flex-wrap gap-2">
                    @if (r.status !== 'APPROVED') {<button sv-button size="sm" [loading]="busy() === r.id" (click)="moderate(r, 'APPROVED')">Opublikuj</button>}
                    @if (r.status !== 'REJECTED') {<button sv-button size="sm" variant="secondary" [disabled]="busy() === r.id" (click)="moderate(r, 'REJECTED')">Odrzuć</button>}
                    <button sv-button size="sm" variant="ghost" (click)="startReply(r)">{{ r.reply ? 'Edytuj odpowiedź' : 'Odpowiedz publicznie' }}</button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </div>
    </sv-card>
  `,
})
export class ReviewsPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(ReviewsApi);
  private readonly toast = inject(ToastService);
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly canWrite = this.ctx.can('CONTENT_WRITE');
  protected readonly tabs: TabOption[] = [
    { id: 'PENDING', label: 'Do moderacji' }, { id: 'APPROVED', label: 'Opublikowane' }, { id: 'REJECTED', label: 'Odrzucone' }, { id: 'ALL', label: 'Wszystkie' },
  ];
  protected readonly tab = signal<ReviewStatus | 'ALL'>('PENDING');
  protected readonly busy = signal<string | null>(null);
  protected readonly replying = signal<string | null>(null);
  protected replyText = '';
  protected readonly reviews = rxResource({
    params: () => ({ t: this.ctx.tenantId(), status: this.tab() === 'ALL' ? null : (this.tab() as ReviewStatus) }),
    stream: ({ params }) => this.api.list(params.t, params.status, 0),
  });

  protected setTab(tab: ReviewStatus | 'ALL'): void {
    this.tab.set(tab);
    this.replying.set(null);
  }

  protected async moderate(r: Review, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    this.busy.set(r.id);
    try {
      await firstValueFrom(this.api.moderate(this.ctx.tenantId(), r.id, status));
      this.toast.success(status === 'APPROVED' ? 'Opinia jest widoczna w sklepie.' : 'Opinia została odrzucona.');
      this.reviews.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }

  protected startReply(r: Review): void {
    this.replyText = r.reply ?? '';
    this.replying.set(r.id);
  }

  protected async saveReply(r: Review): Promise<void> {
    this.busy.set(r.id);
    try {
      await firstValueFrom(this.api.reply(this.ctx.tenantId(), r.id, this.replyText.trim() || null));
      this.toast.success('Zapisano odpowiedź.');
      this.replying.set(null);
      this.reviews.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}
