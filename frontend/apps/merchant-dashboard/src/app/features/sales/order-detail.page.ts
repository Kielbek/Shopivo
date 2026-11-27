import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi, OrdersApi } from '@shopivo/api-client';
import { ContentRevision, ORDER_STATUS_LABELS, Order, OrderAddress, OrderStatus, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, DialogComponent, FieldComponent, LoadingComponent,
  MoneyPipe, ToastService, icons,
} from '@shopivo/shared-ui';
import { Observable, firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { ORDER_TONE, PAYMENT_TONE } from './order-tones';
import { RichPreviewComponent } from '../content/rich-preview';
import { OrderShipmentsComponent } from './order-shipments';

type Pending = { kind: 'ship' } | { kind: 'cancel' } | null;

@Component({
  selector: 'sv-order-detail-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, CardComponent, BadgeComponent, ButtonComponent, AlertComponent, FieldComponent,
    LoadingComponent, DialogComponent, DatePipe, MoneyPipe, RichPreviewComponent, OrderShipmentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (order.isLoading() && !order.value()) {
      <sv-loading class="mt-2" variant="detail" label="Wczytywanie zamówienia…" />
    } @else if (order.error()) {
      <sv-alert tone="error" class="mt-6">Nie znaleziono zamówienia.</sv-alert>
    } @else if (order.value(); as o) {
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <a sv-button variant="ghost" size="icon" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia']" aria-label="Wróć do zamówień"><svg [lucideIcon]="icons.arrowLeft" /></a>
          <div class="min-w-0">
            <h1 class="text-[24px] font-semibold tracking-[-0.02em] text-ink">Zamówienie #{{ o.number }}</h1>
            <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-muted">
              <sv-badge [tone]="orderTone[o.status]">{{ statusLabels[o.status] }}</sv-badge>
              <sv-badge [tone]="paymentTone[o.paymentStatus]">{{ paymentLabels[o.paymentStatus] }}</sv-badge>
              {{ o.createdAt | svDate }} · {{ o.source === 'PANEL' ? 'dodane w panelu' : 'sklep internetowy' }}
            </p>
          </div>
        </div>
        @if (canWrite) {
          <div class="flex flex-wrap gap-2">
            @if (o.paymentStatus === 'UNPAID' && o.status !== 'CANCELED') {
              <button sv-button variant="secondary" [loading]="busy()" (click)="run(api.markPaid(t(), o.id, o.version), 'Oznaczono jako opłacone.')">Oznacz jako opłacone</button>
            }
            @if (o.paymentStatus === 'PAID' && o.status === 'CANCELED') {
              <button sv-button variant="secondary" [loading]="busy()" (click)="run(api.markRefunded(t(), o.id, o.version), 'Oznaczono zwrot pieniędzy.')">Oznacz zwrot pieniędzy</button>
            }
            @if (o.status === 'NEW') {
              <button sv-button variant="secondary" [loading]="busy()" (click)="run(api.changeStatus(t(), o.id, 'PROCESSING', o.version), 'Przekazano do realizacji.')">Do realizacji</button>
            }
            @if (o.status === 'NEW' || o.status === 'PROCESSING') {
              <button sv-button variant="ghost" (click)="pending.set({ kind: 'cancel' })">Anuluj</button>
              <button sv-button (click)="pending.set({ kind: 'ship' })"><svg [lucideIcon]="icons.shipping" />Wyślij</button>
            }
            @if (o.status === 'SHIPPED') {
              <button sv-button [loading]="busy()" (click)="run(api.changeStatus(t(), o.id, 'COMPLETED', o.version), 'Zamówienie zrealizowane.')">Oznacz jako zrealizowane</button>
            }
          </div>
        }
      </div>

      @if (o.status === 'CANCELED' && o.cancelReason) {
        <sv-alert tone="warning" class="mt-5">Anulowano: {{ o.cancelReason }}</sv-alert>
      }

      <div class="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="min-w-0 space-y-4">
          <sv-card heading="Produkty" [flush]="true">
            <div class="overflow-x-auto px-5">
              <table class="sv-table min-w-[560px]">
                <thead><tr><th scope="col">Produkt</th><th scope="col" class="text-right">Cena</th><th scope="col" class="text-right">Ilość</th><th scope="col" class="text-right">Razem</th></tr></thead>
                <tbody>
                  @for (i of o.items; track i.id) {
                    <tr>
                      <td>
                        @if (i.productId) {<a class="font-medium text-ink hover:text-primary-strong" [routerLink]="['/sklep', t(), 'produkty', i.productId]">{{ i.name }}</a>}
                        @else {<span class="font-medium text-ink">{{ i.name }}</span>}
                        <p class="text-[12px] text-ink-muted">{{ i.variantTitle }}@if (i.variantTitle && i.sku) { · }{{ i.sku ? 'SKU ' + i.sku : '' }}</p>
                      </td>
                      <td class="whitespace-nowrap text-right tabular-nums">{{ i.unitPriceMinor | svMoney }}</td>
                      <td class="text-right tabular-nums">{{ i.quantity }}</td>
                      <td class="whitespace-nowrap text-right font-medium tabular-nums">{{ i.lineTotalMinor | svMoney }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <dl class="space-y-1.5 border-t border-line px-5 py-4 text-[13px]">
              <div class="flex justify-between"><dt class="text-ink-soft">Produkty</dt><dd class="tabular-nums">{{ o.subtotalMinor | svMoney }}</dd></div>
              @if (o.shippingMethodName) {
                <div class="flex justify-between"><dt class="text-ink-soft">Dostawa: {{ o.shippingMethodName }}</dt><dd class="tabular-nums">{{ o.shippingMinor | svMoney }}</dd></div>
              }
              @if (o.paymentFeeMinor) {
                <div class="flex justify-between"><dt class="text-ink-soft">Opłata za pobranie</dt><dd class="tabular-nums">{{ o.paymentFeeMinor | svMoney }}</dd></div>
              }
              <div class="flex justify-between border-t border-line pt-2 text-[15px] font-semibold text-ink"><dt>Razem</dt><dd class="tabular-nums">{{ o.totalMinor | svMoney: o.currency }}</dd></div>
              <div class="flex justify-between text-[12px] text-ink-muted"><dt>w tym VAT</dt><dd class="tabular-nums">{{ o.taxMinor | svMoney }}</dd></div>
            </dl>
          </sv-card>

          <sv-card heading="Historia i notatki">
            <ol class="space-y-3">
              @for (e of o.events; track $index) {
                <li class="flex gap-3 text-[13px]">
                  <span class="mt-1.5 size-2 shrink-0 rounded-full" [class]="e.type === 'NOTE' ? 'bg-violet' : 'bg-primary'"></span>
                  <div class="min-w-0">
                    <p class="text-ink" [class.rounded-[8px]]="e.type === 'NOTE'" [class.bg-canvas]="e.type === 'NOTE'" [class.px-3]="e.type === 'NOTE'" [class.py-2]="e.type === 'NOTE'">{{ e.message }}</p>
                    <p class="mt-0.5 text-[12px] text-ink-muted">{{ e.createdAt | svDate }}@if (e.actorName) { · {{ e.actorName }}}@if (e.type === 'NOTE') { · notatka wewnętrzna}</p>
                  </div>
                </li>
              }
            </ol>
            @if (canWrite) {
              <form class="mt-4 flex gap-2 border-t border-line pt-4" (ngSubmit)="addNote()">
                <input class="sv-input" name="note" maxlength="1000" placeholder="Dodaj notatkę (widoczną tylko dla zespołu)" aria-label="Notatka" [(ngModel)]="note" />
                <button sv-button type="submit" variant="secondary" [disabled]="!note.trim()">Dodaj</button>
              </form>
            }
          </sv-card>
        </div>

        <div class="min-w-0 space-y-4">
          <sv-card heading="Klient">
            <p class="font-medium text-ink">{{ o.firstName }} {{ o.lastName }}</p>
            <p class="text-[13px] text-ink-soft"><a class="sv-link" [href]="'mailto:' + o.email">{{ o.email }}</a></p>
            @if (o.phone) {<p class="text-[13px] text-ink-soft">{{ o.phone }}</p>}
            @if (o.customerId) {
              <a class="sv-link mt-2 inline-block text-[13px]" [routerLink]="['/sklep', t(), 'klienci']" [queryParams]="{ klient: o.customerId }">Karta klienta</a>
            }
            @if (o.customerNote) {
              <div class="mt-3 rounded-[8px] bg-canvas px-3 py-2 text-[13px]"><p class="text-[12px] font-medium text-ink-muted">Uwagi klienta</p>{{ o.customerNote }}</div>
            }
            @if (o.termsAcceptedAt) {
              <p class="mt-3 text-[12px] text-ink-muted">Regulamin zaakceptowany {{ o.termsAcceptedAt | svDate }}
                @if (o.termsRevisionId) {· <button type="button" class="sv-link" (click)="showTerms(o.termsRevisionId)">pokaż tę wersję</button>}
              </p>
            }
          </sv-card>
          @if (o.shippingAddress || o.pickupPoint) {
            <sv-card heading="Dostawa">
              @if (o.pickupPoint; as p) {
                <p class="text-[13px] font-medium text-ink">Paczkomat {{ p.code }}</p>
                <p class="text-[13px] text-ink-soft">{{ p.address }}</p>
                @if (p.name && p.name !== p.code) {<p class="text-[12px] text-ink-muted">{{ p.name }}</p>}
              }
              @if (o.shippingAddress; as a) {
                <address class="whitespace-pre-line text-[13px] not-italic leading-5 text-ink-soft" [class.mt-2]="!!o.pickupPoint">{{ lines(a) }}</address>
              }
              @if (o.shippingMethodName) {<p class="mt-2 text-[13px] text-ink">{{ o.shippingMethodName }}</p>}
              @if (o.trackingNumber) {<p class="text-[13px] text-ink-soft">Nr przesyłki: <span class="font-medium text-ink">{{ o.trackingNumber }}</span></p>}
            </sv-card>
          }
          @if (o.shippingCarrier) {
            <sv-order-shipments [order]="o" (changed)="order.reload()" />
          }
          <sv-card heading="Płatność">
            <p class="text-[13px] text-ink">{{ methodLabels[o.paymentMethod] }}</p>
            @if (o.paidAt) {<p class="text-[13px] text-ink-soft">Opłacono {{ o.paidAt | svDate }}</p>}
          </sv-card>
          @if (o.billing; as b) {
            <sv-card heading="Faktura">
              <p class="text-[13px] font-medium text-ink">{{ b.companyName }}</p>
              <p class="text-[13px] text-ink-soft">NIP {{ b.taxId }}</p>
              @if (b.address) {<address class="mt-1 whitespace-pre-line text-[13px] not-italic text-ink-soft">{{ lines(b.address) }}</address>}
              @else {<p class="text-[12px] text-ink-muted">Adres jak do dostawy</p>}
            </sv-card>
          }
        </div>
      </div>

      <sv-dialog [heading]="pending()?.kind === 'ship' ? 'Wysyłka zamówienia #' + o.number : 'Anulować zamówienie #' + o.number + '?'"
        [open]="!!pending()" (closed)="pending.set(null)">
        @if (pending()?.kind === 'ship') {
          <p>Stany magazynowe zostaną pomniejszone, a klient dostanie e-mail o wysyłce.</p>
          <sv-field label="Numer przesyłki" for="tracking" [optional]="true" class="mt-4 block">
            <input id="tracking" class="sv-input" maxlength="80" [(ngModel)]="tracking" />
          </sv-field>
        } @else {
          <p>Zarezerwowane produkty wrócą do sprzedaży, a klient dostanie e-mail.@if (o.paymentStatus === 'PAID') { Zwrot pieniędzy wykonaj samodzielnie i oznacz go w zamówieniu.}</p>
          <sv-field label="Powód" for="reason" [optional]="true" class="mt-4 block">
            <input id="reason" class="sv-input" maxlength="300" [(ngModel)]="reason" />
          </sv-field>
        }
        <ng-container dialog-actions>
          <button sv-button variant="secondary" type="button" (click)="pending.set(null)">Zamknij</button>
          @if (pending()?.kind === 'ship') {
            <button sv-button type="button" [loading]="busy()" (click)="ship(o)">Potwierdź wysyłkę</button>
          } @else {
            <button sv-button variant="danger" type="button" [loading]="busy()" (click)="cancel(o)">Anuluj zamówienie</button>
          }
        </ng-container>
      </sv-dialog>

      <sv-dialog heading="Regulamin zaakceptowany przez klienta" [open]="!!terms()" (closed)="terms.set(null)">
        @if (terms(); as r) {
          <p class="text-[12px] text-ink-muted">{{ r.title }} · wersja opublikowana {{ r.publishedAt | svDate }}</p>
          <div class="mt-3 max-h-[60vh] overflow-y-auto rounded-[8px] border border-line p-4"><sv-rich-preview [source]="r.body" /></div>
        }
        <ng-container dialog-actions><button sv-button variant="secondary" type="button" (click)="terms.set(null)">Zamknij</button></ng-container>
      </sv-dialog>
    }
  `,
})
export class OrderDetailPage {
  protected readonly ctx = inject(StoreContext);
  protected readonly api = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly paymentLabels = PAYMENT_STATUS_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly orderTone = ORDER_TONE;
  protected readonly paymentTone = PAYMENT_TONE;
  protected readonly canWrite = this.ctx.can('ORDERS_WRITE');
  private readonly content = inject(ContentApi);
  protected readonly terms = signal<ContentRevision | null>(null);

  protected async showTerms(revisionId: string): Promise<void> {
    try {
      this.terms.set(await firstValueFrom(this.content.revision(this.t(), revisionId)));
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  readonly orderId = input.required<string>();
  protected readonly t = computed(() => this.ctx.tenantId());
  protected readonly order = rxResource({
    params: () => ({ t: this.ctx.tenantId(), id: this.orderId() }),
    stream: ({ params }) => this.api.order(params.t, params.id),
  });
  protected readonly busy = signal(false);
  protected readonly pending = signal<Pending>(null);
  protected note = '';
  protected tracking = '';
  protected reason = '';

  protected lines(a: OrderAddress): string {
    return [a.name, a.company, a.line1, a.line2, `${a.postalCode} ${a.city}`, a.countryCode !== 'PL' ? a.countryCode : null, a.phone]
      .filter(Boolean).join('\n');
  }

  protected async run(action: Observable<Order>, success: string): Promise<void> {
    this.busy.set(true);
    try {
      this.order.set(await firstValueFrom(action));
      this.toast.success(success);
      this.pending.set(null);
    } catch (e) {
      const err = ApiError.from(e);
      this.toast.error(err.message);
      if (err.code === 'VERSION_CONFLICT') this.order.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected ship(o: Order): Promise<void> {
    return this.run(this.api.changeStatus(this.t(), o.id, 'SHIPPED' as OrderStatus, o.version, { trackingNumber: this.tracking.trim() || null }),
      'Zamówienie wysłane — klient dostał powiadomienie.');
  }

  protected cancel(o: Order): Promise<void> {
    return this.run(this.api.changeStatus(this.t(), o.id, 'CANCELED' as OrderStatus, o.version, { reason: this.reason.trim() || null }),
      'Zamówienie anulowane.');
  }

  protected async addNote(): Promise<void> {
    const o = this.order.value();
    if (!o || !this.note.trim()) return;
    await this.run(this.api.addNote(this.t(), o.id, this.note.trim()), 'Dodano notatkę.');
    this.note = '';
  }
}
