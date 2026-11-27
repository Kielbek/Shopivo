import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ReturnsApi } from '@shopivo/api-client';
import { ReturnRequest, ReturnStatus } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, BadgeTone, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent, LoadingComponent,
  MoneyPipe, PageHeaderComponent, TabOption, TabsComponent, ToastService, icons, plural,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const STATUS: Record<ReturnStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: 'Do rozpatrzenia', tone: 'warning' },
  ACCEPTED: { label: 'Przyjęte — czeka na zwrot', tone: 'info' },
  REJECTED: { label: 'Odrzucone', tone: 'neutral' },
  COMPLETED: { label: 'Zakończone', tone: 'success' },
};

type Filter = 'open' | ReturnStatus | 'all';

/**
 * Returns and complaints from customer accounts: accept or reject (with a message for the customer), then mark as
 * completed once the goods are back and the money is refunded.
 */
@Component({
  selector: 'sv-returns-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, DialogComponent, TabsComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Zwroty i reklamacje" description="Zgłoszenia klientów z kont w sklepie. Klient dostaje e-mail przy każdej zmianie statusu." />

    <sv-tabs class="mt-6" label="Status zgłoszeń" [tabs]="tabs" [active]="filter()" (activeChange)="setFilter($any($event))" />

    <sv-card class="mt-4" [flush]="true">
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading variant="list" />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać zgłoszeń.</sv-alert></div>
      } @else if (!items().length) {
        <sv-empty-state icon="undo" [title]="filter() === 'open' ? 'Nic do rozpatrzenia' : 'Brak zgłoszeń'"
          description="Klienci zgłaszają zwroty (14 dni od otrzymania) i reklamacje ze swojego konta, na stronie zamówienia." />
      } @else {
        <ul>
          @for (r of items(); track r.id) {
            <li class="relative flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-hover">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px]" [class]="r.kind === 'WITHDRAWAL' ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning-ink'">
                <svg [lucideIcon]="r.kind === 'WITHDRAWAL' ? icons.undo : icons.wrench" [size]="16" /></span>
              <div class="min-w-0 flex-1">
                <button type="button" class="text-left font-medium text-ink after:absolute after:inset-0 hover:underline" (click)="open(r)">
                  {{ r.kind === 'WITHDRAWAL' ? 'Zwrot' : 'Reklamacja' }} nr {{ r.number }}</button>
                <p class="truncate text-[12px] text-ink-muted">{{ r.customerName || r.customerEmail }} · zamówienie #{{ r.orderNumber }} ·
                  {{ plural(count(r), 'produkt', 'produkty', 'produktów') }} · {{ r.createdAt | svDate: 'relative' }}</p>
              </div>
              <span class="text-[13px] tabular-nums text-ink">{{ r.valueMinor | svMoney: r.currency }}</span>
              <sv-badge [tone]="labels[r.status].tone">{{ labels[r.status].label }}</sv-badge>
            </li>
          }
        </ul>
        @if ((rows.value()?.totalPages ?? 1) > 1) {
          <div class="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        }
      }
    </sv-card>

    <sv-dialog [heading]="selected() ? (selected()!.kind === 'WITHDRAWAL' ? 'Zwrot' : 'Reklamacja') + ' nr ' + selected()!.number : ''" [open]="!!selected()" (closed)="close()">
      @if (selected(); as r) {
        <div class="space-y-4 text-[13px]">
          <div class="flex flex-wrap items-center gap-2">
            <sv-badge [tone]="labels[r.status].tone">{{ labels[r.status].label }}</sv-badge>
            <span class="text-ink-muted">zgłoszono {{ r.createdAt | svDate }}</span>
          </div>
          <dl class="grid grid-cols-2 gap-3">
            <div><dt class="text-ink-muted">Klient</dt><dd class="break-all text-ink">{{ r.customerName }}<br />{{ r.customerEmail }}</dd></div>
            <div><dt class="text-ink-muted">Zamówienie</dt><dd><a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia', r.orderId]">#{{ r.orderNumber }}</a></dd></div>
            <div><dt class="text-ink-muted">Rodzaj</dt><dd class="text-ink">{{ r.kind === 'WITHDRAWAL' ? 'Odstąpienie od umowy (14 dni)' : 'Reklamacja' }}</dd></div>
            <div><dt class="text-ink-muted">Rachunek do zwrotu</dt><dd class="break-all tabular-nums text-ink">{{ r.refundAccount ? iban(r.refundAccount) : 'nie podano' }}</dd></div>
          </dl>
          <ul class="divide-y divide-line rounded-[10px] border border-line">
            @for (i of r.items; track i.orderItemId) {
              <li class="flex justify-between gap-3 px-3 py-2"><span>{{ i.quantity }} × {{ i.name }}@if (i.variantTitle) { <span class="text-ink-muted">({{ i.variantTitle }})</span>}</span>
                <span class="tabular-nums">{{ i.quantity * i.unitPriceMinor | svMoney: r.currency }}</span></li>
            }
            <li class="flex justify-between gap-3 px-3 py-2 font-medium"><span>Wartość produktów</span><span class="tabular-nums">{{ r.valueMinor | svMoney: r.currency }}</span></li>
          </ul>
          @if (r.reason) {<div><p class="text-ink-muted">{{ r.kind === 'COMPLAINT' ? 'Opis wady' : 'Powód' }}</p><p class="mt-0.5 whitespace-pre-line text-ink">{{ r.reason }}</p></div>}
          @if (r.kind === 'COMPLAINT' && r.status === 'REQUESTED') {
            <sv-alert tone="warning">Na reklamację konsumenta trzeba odpowiedzieć w ciągu 14 dni — inaczej uznaje się ją za przyjętą.</sv-alert>
          }
          @if (r.merchantNote && r.status !== 'REQUESTED') {<div><p class="text-ink-muted">Twoja wiadomość do klienta</p><p class="mt-0.5 whitespace-pre-line text-ink">{{ r.merchantNote }}</p></div>}
          @if (canWrite && (r.status === 'REQUESTED' || r.status === 'ACCEPTED')) {
            <div>
              <label class="sv-label" for="ret-note">{{ r.status === 'REQUESTED' ? 'Wiadomość do klienta' : 'Wiadomość przy zakończeniu (opcjonalnie)' }}</label>
              <textarea id="ret-note" class="sv-input mt-1.5 min-h-20 py-2.5" maxlength="2000" [(ngModel)]="note"
                [placeholder]="r.status === 'REQUESTED' ? 'Np. adres do odesłania paczki albo powód odrzucenia (wymagany przy odrzuceniu)' : 'Np. Zwróciliśmy 129 zł na Twój rachunek.'"></textarea>
            </div>
            @if (error(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
          }
        </div>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="close()">Zamknij</button>
        @if (canWrite && selected()?.status === 'REQUESTED') {
          <button sv-button variant="danger" type="button" [loading]="busy() === 'reject'" [disabled]="!!busy()" (click)="decide(false)">Odrzuć</button>
          <button sv-button type="button" [loading]="busy() === 'accept'" [disabled]="!!busy()" (click)="decide(true)">Przyjmij</button>
        }
        @if (canWrite && selected()?.status === 'ACCEPTED') {
          <button sv-button type="button" [loading]="busy() === 'complete'" (click)="complete()">Towar wrócił, pieniądze zwrócone</button>
        }
      </ng-container>
    </sv-dialog>
  `,
})
export class ReturnsPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(ReturnsApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly labels = STATUS;
  protected readonly plural = plural;
  protected readonly canWrite = this.ctx.can('ORDERS_WRITE');
  protected readonly tabs: TabOption[] = [
    { id: 'open', label: 'Do rozpatrzenia' }, { id: 'ACCEPTED', label: 'Przyjęte' }, { id: 'COMPLETED', label: 'Zakończone' },
    { id: 'REJECTED', label: 'Odrzucone' }, { id: 'all', label: 'Wszystkie' },
  ];
  protected readonly filter = signal<Filter>('open');
  protected readonly page = signal(0);
  protected readonly selected = signal<ReturnRequest | null>(null);
  protected readonly busy = signal<'accept' | 'reject' | 'complete' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected note = '';

  protected readonly rows = rxResource({
    params: () => ({ t: this.ctx.tenantId(), f: this.filter(), p: this.page() }),
    stream: ({ params }) => this.api.list(params.t, params.f === 'all' ? null : params.f === 'open' ? 'REQUESTED' : params.f, params.p),
  });
  protected readonly items = computed(() => this.rows.value()?.items ?? []);

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    this.page.set(0);
  }

  protected count(r: ReturnRequest): number {
    return r.items.reduce((a, i) => a + i.quantity, 0);
  }

  protected iban(v: string): string {
    return v.replace(/^PL/, 'PL ').replace(/(\d{2})(?=\d)/, '$1 ').replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  protected open(r: ReturnRequest): void {
    this.note = '';
    this.error.set(null);
    this.selected.set(r);
  }

  protected close(): void {
    if (!this.busy()) this.selected.set(null);
  }

  protected async decide(accept: boolean): Promise<void> {
    const r = this.selected();
    if (!r) return;
    if (!accept && !this.note.trim()) {
      this.error.set('Napisz klientowi, dlaczego odrzucasz zgłoszenie.');
      return;
    }
    await this.run(accept ? 'accept' : 'reject', () => this.api.decide(this.ctx.tenantId(), r.id, accept, this.note.trim() || null, r.version),
      accept ? 'Przyjęto zgłoszenie — klient dostał e-mail.' : 'Odrzucono zgłoszenie — klient dostał e-mail z uzasadnieniem.');
  }

  protected async complete(): Promise<void> {
    const r = this.selected();
    if (!r) return;
    await this.run('complete', () => this.api.complete(this.ctx.tenantId(), r.id, this.note.trim() || null, r.version), 'Zgłoszenie zakończone.');
  }

  private async run(kind: 'accept' | 'reject' | 'complete', call: () => ReturnType<ReturnsApi['decide']>, done: string): Promise<void> {
    this.busy.set(kind);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(call());
      this.toast.success(done);
      this.note = '';
      this.selected.set(updated.status === 'ACCEPTED' ? updated : null);
      this.rows.reload();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}
