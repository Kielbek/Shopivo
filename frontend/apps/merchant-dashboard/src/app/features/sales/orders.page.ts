import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { OrdersApi } from '@shopivo/api-client';
import {
  ORDER_STATUS_LABELS, OrderPaymentStatus, OrderRow, OrderStatus, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
} from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, EmptyStateComponent, LoadingComponent, MoneyPipe,
  PageHeaderComponent, SelectComponent, SelectOption, StatCardComponent, TabOption, TabsComponent, formatMoney, icons, plural,
} from '@shopivo/shared-ui';
import { StoreContext } from '../store/store-context';
import { ORDER_TONE, PAYMENT_TONE } from './order-tones';

@Component({
  selector: 'sv-orders-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, EmptyStateComponent, TabsComponent, SelectComponent, StatCardComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Zamówienia" description="Zamówienia ze sklepu i dodane ręcznie w panelu.">
      @if (canWrite) {<a sv-button routerLink="nowe"><svg [lucideIcon]="icons.plus" />Dodaj zamówienie</a>}
    </sv-page-header>

    <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <sv-stat-card [loading]="stats.isLoading()" label="Nowe" icon="orders" tone="violet" [value]="stat('newOrders')" caption="Czekają na realizację" />
      <sv-stat-card [loading]="stats.isLoading()" label="W realizacji" icon="shipping" tone="blue" [value]="stat('processing')" caption="Do wysłania" />
      <sv-stat-card [loading]="stats.isLoading()" label="Nieopłacone" icon="alert" tone="orange" [value]="stat('unpaid')" caption="Przelewy w oczekiwaniu" />
      <sv-stat-card [loading]="stats.isLoading()" label="Sprzedaż 30 dni" icon="dollar" tone="green" [value]="revenue()" [caption]="ordersCaption()" />
    </div>

    <sv-card class="mt-4" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5">
        <sv-tabs label="Status zamówień" [tabs]="tabs" [active]="tab()" (activeChange)="tab.set($event); page.set(0)" />
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative sm:w-80">
            <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input class="sv-input pl-9" type="search" placeholder="Numer, klient lub e-mail…" aria-label="Szukaj zamówień"
              [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
          </div>
          <sv-select class="sm:w-56" [options]="paymentOptions" [value]="payment()" (valueChange)="payment.set($event || ''); page.set(0)" ariaLabel="Płatność" />
        </div>
      </div>
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading variant="table" [rows]="6" />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać zamówień.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        <sv-empty-state icon="orders" [title]="filtered() ? 'Brak wyników' : 'Brak zamówień'"
          [description]="filtered() ? 'Zmień filtry.' : 'Zamówienia ze sklepu pojawią się tutaj. Możesz też dodać zamówienie telefoniczne ręcznie.'" />
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[820px]">
            <thead><tr><th scope="col">Zamówienie</th><th scope="col">Klient</th><th scope="col">Status</th><th scope="col">Płatność</th>
              <th scope="col" class="text-right">Kwota</th><th scope="col">Data</th></tr></thead>
            <tbody>
              @for (o of rows.value()!.items; track o.id) {
                <tr class="cursor-pointer hover:bg-hover" (click)="open(o)">
                  <td><a class="font-medium text-ink hover:text-primary-strong" [routerLink]="[o.id]" (click)="$event.stopPropagation()">#{{ o.number }}</a>
                    <p class="text-[12px] text-ink-muted">{{ o.itemCount }} szt.</p></td>
                  <td><p class="text-ink">{{ o.customerName }}</p><p class="text-[12px] text-ink-muted">{{ o.email }}</p></td>
                  <td><sv-badge [tone]="orderTone[o.status]">{{ statusLabels[o.status] }}</sv-badge></td>
                  <td><sv-badge [tone]="paymentTone[o.paymentStatus]">{{ paymentLabels[o.paymentStatus] }}</sv-badge>
                    <p class="mt-0.5 text-[11px] text-ink-muted">{{ methodLabels[o.paymentMethod] }}</p></td>
                  <td class="whitespace-nowrap text-right font-medium tabular-nums">{{ o.totalMinor | svMoney: o.currency }}</td>
                  <td class="whitespace-nowrap text-ink-muted">{{ o.createdAt | svDate }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ ordersCount() }}</span>
          <div class="flex gap-2">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </sv-card>
  `,
})
export class OrdersPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly paymentLabels = PAYMENT_STATUS_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly orderTone = ORDER_TONE;
  protected readonly paymentTone = PAYMENT_TONE;
  protected readonly canWrite = this.ctx.can('ORDERS_WRITE');

  protected readonly tabs: TabOption[] = [{ id: '', label: 'Wszystkie' },
    ...(['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELED'] as OrderStatus[]).map((s) => ({ id: s, label: ORDER_STATUS_LABELS[s] }))];
  protected readonly paymentOptions: SelectOption[] = [{ value: '', label: 'Każda płatność' },
    ...(['UNPAID', 'PAID', 'REFUNDED'] as OrderPaymentStatus[]).map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))];

  protected readonly tab = signal('');
  protected readonly query = signal('');
  protected readonly payment = signal('');
  protected readonly page = signal(0);

  protected readonly stats = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.stats(params) });
  protected readonly rows = rxResource({
    params: () => ({ t: this.ctx.tenantId(), q: this.query(), status: (this.tab() || null) as OrderStatus | null,
      paymentStatus: (this.payment() || null) as OrderPaymentStatus | null, page: this.page() }),
    stream: ({ params }) => this.api.orders(params.t, params),
  });

  protected readonly filtered = computed(() => !!this.tab() || !!this.query().trim() || !!this.payment());
  protected readonly revenue = computed(() => (this.stats.value() ? formatMoney(this.stats.value()!.revenue30dMinor) : null));
  protected readonly ordersCaption = computed(() => (this.stats.value() ? plural(this.stats.value()!.orders30d, 'zamówienie', 'zamówienia', 'zamówień') : ''));

  protected ordersCount(): string {
    return plural(this.rows.value()?.totalItems ?? 0, 'zamówienie', 'zamówienia', 'zamówień');
  }

  protected stat(key: 'newOrders' | 'processing' | 'unpaid'): string | null {
    const s = this.stats.value();
    return s ? String(s[key]) : null;
  }

  protected open(o: OrderRow): void {
    void this.router.navigate(['/sklep', this.ctx.tenantId(), 'zamowienia', o.id]);
  }
}
