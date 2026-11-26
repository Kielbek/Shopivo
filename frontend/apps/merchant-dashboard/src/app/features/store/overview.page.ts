import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { CatalogApi, OrdersApi, SessionStore, TenantApi } from '@shopivo/api-client';
import { ORDER_STATUS_LABELS } from '@shopivo/shared-models';
import {
  CardComponent, ChartSeries, DatePipe, EmptyStateComponent, LineChartComponent, MoneyPipe,
  StatCardComponent, formatMoney, icons, plural,
} from '@shopivo/shared-ui';
import { of } from 'rxjs';
import { StoreContext } from './store-context';
import { StorePublicationComponent } from '../storefront/store-publication';

interface ChecklistItem {
  label: string;
  done: boolean;
  link: string | unknown[];
}

const DAY = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });

/** Store overview: real sales, order and stock figures (widgets are hidden from roles without access). */
@Component({
  selector: 'sv-overview-page',
  imports: [RouterLink, LucideDynamicIcon, StorePublicationComponent, StatCardComponent, CardComponent, LineChartComponent, EmptyStateComponent,
    DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-ink">Przegląd</h1>
        <p class="mt-1 text-[13px] text-ink-muted">Witaj, {{ firstName() }}! · <time [attr.datetime]="isoToday">{{ today }}</time></p>
      </div>
    </div>

    <sv-store-publication />

    @if (!setupDone()) {
      <section class="sv-card mt-6 p-5" aria-labelledby="setup-title">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="setup-title" class="text-[15px] font-semibold text-ink">Dokończ konfigurację sklepu</h2>
            <p class="mt-0.5 text-[12px] text-ink-muted">{{ doneCount() }} z {{ checklist().length }} kroków ukończonych</p>
          </div>
          <div class="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-canvas" role="progressbar"
            [attr.aria-valuenow]="doneCount()" aria-valuemin="0" [attr.aria-valuemax]="checklist().length" aria-label="Postęp konfiguracji">
            <div class="h-full rounded-full bg-primary transition-[width]" [style.width.%]="(doneCount() / checklist().length) * 100"></div>
          </div>
        </div>
        <ul class="mt-4 grid gap-2 md:grid-cols-3">
          @for (item of checklist(); track item.label) {
            <li>
              <a [routerLink]="item.link" class="flex h-full items-center gap-3 rounded-[10px] bg-[#F7F8FA] px-3.5 py-3 transition-colors hover:bg-primary-soft">
                <span class="flex size-6 shrink-0 items-center justify-center rounded-full"
                  [class]="item.done ? 'bg-success text-white' : 'border-[1.5px] border-line-strong text-transparent'">
                  <svg [lucideIcon]="icons.check" [size]="14" [strokeWidth]="3" />
                </span>
                <span class="min-w-0 flex-1 text-[13px]" [class]="item.done ? 'text-ink-muted line-through decoration-line-strong' : 'font-medium text-ink'">
                  {{ item.label }}<span class="sr-only">{{ item.done ? ' (ukończone)' : '' }}</span>
                </span>
                @if (!item.done) {<svg [lucideIcon]="icons.chevronRight" [size]="16" class="text-ink-muted" />}
              </a>
            </li>
          }
        </ul>
      </section>
    }

    <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <sv-stat-card label="Sprzedaż dziś" icon="cart" tone="coral" [value]="money(orderStats.value()?.revenueTodayMinor)"
        [caption]="orderStats.value() ? ordersWord(orderStats.value()!.ordersToday) : ''" />
      <sv-stat-card label="Do realizacji" icon="bag" tone="violet" [value]="count(toFulfil())" caption="Nowe i w realizacji" />
      <sv-stat-card label="Produkty" icon="box" tone="orange" [value]="count(catalogStats.value()?.activeProducts)"
        [caption]="catalogStats.value() ? catalogStats.value()!.lowStockVariants + ' z niskim stanem' : ''" />
      <sv-stat-card label="Przychód 30 dni" icon="dollar" tone="blue" [value]="money(orderStats.value()?.revenue30dMinor)"
        [caption]="orderStats.value() ? ordersWord(orderStats.value()!.orders30d) : ''" />
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <sv-card heading="Sprzedaż" subheading="Ostatnie 30 dni, kwoty brutto">
        @if (canOrders) {
          <sv-line-chart [labels]="labels()" [series]="series()" [height]="300" [format]="moneyAxis" ariaLabel="Przychód dzienny z ostatnich 30 dni">
            <p class="text-[12px] text-ink-muted">Brak sprzedaży w tym okresie</p>
          </sv-line-chart>
        } @else {
          <p class="text-[13px] text-ink-muted">Brak uprawnień do danych sprzedaży.</p>
        }
      </sv-card>

      <sv-card heading="Ostatnie zamówienia" [flush]="true">
        @if (!recent.value()?.items?.length) {
          <sv-empty-state icon="orders" title="Brak zamówień" />
        } @else {
          <ul class="px-5">
            @for (o of recent.value()!.items; track o.id) {
              <li class="border-b border-line last:border-b-0">
                <a class="flex items-center gap-3 py-3" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia', o.id]">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] font-medium text-ink">#{{ o.number }} · {{ o.customerName }}</span>
                    <span class="text-[12px] text-ink-muted">{{ statusLabels[o.status] }} · {{ o.createdAt | svDate: 'relative' }}</span>
                  </span>
                  <span class="shrink-0 text-[13px] font-medium tabular-nums text-ink">{{ o.totalMinor | svMoney }}</span>
                </a>
              </li>
            }
          </ul>
          <div class="border-t border-line py-3 text-center">
            <a [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia']" class="text-[13px] font-medium text-ink-soft hover:text-ink">Wszystkie zamówienia</a>
          </div>
        }
      </sv-card>
    </div>

    <div class="mt-4">
      <sv-card heading="Do uzupełnienia w magazynie" [flush]="true">
        @if (!lowStock.value()?.items?.length) {
          <sv-empty-state icon="inventory" title="Stany w porządku" description="Warianty poniżej progu niskiego stanu pojawią się tutaj." />
        } @else {
          <div class="overflow-x-auto px-5 pb-2">
            <table class="sv-table min-w-[520px]">
              <thead><tr><th scope="col">Produkt</th><th scope="col">SKU</th><th scope="col" class="text-right">Dostępne</th></tr></thead>
              <tbody>
                @for (r of lowStock.value()!.items; track r.variantId) {
                  <tr>
                    <td><a class="font-medium text-ink hover:text-primary-strong" [routerLink]="['/sklep', ctx.tenantId(), 'produkty', r.productId]">{{ r.productName }}</a>
                      @if (r.variantTitle) {<span class="text-ink-muted"> · {{ r.variantTitle }}</span>}</td>
                    <td class="text-ink-soft">{{ r.sku || '—' }}</td>
                    <td class="text-right font-medium tabular-nums" [class.text-danger-ink]="r.available <= 0">{{ r.available }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </sv-card>
    </div>
  `,
})
export class OverviewPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly session = inject(SessionStore);
  protected readonly icons = icons;

  protected readonly today = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date());
  protected readonly isoToday = new Date().toISOString().slice(0, 10);
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly canOrders = this.ctx.can('ORDERS_READ');
  protected readonly canProducts = this.ctx.can('PRODUCTS_READ');

  protected readonly orderStats = rxResource({
    params: () => (this.canOrders ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.ordersApi.stats(params),
  });
  protected readonly daily = rxResource({
    params: () => (this.canOrders ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.ordersApi.daily(params, 30),
  });
  protected readonly recent = rxResource({
    params: () => (this.canOrders ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.ordersApi.orders(params, { page: 0, size: 6 }),
  });
  protected readonly catalogStats = rxResource({
    params: () => (this.canProducts ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.catalogApi.stats(params),
  });
  protected readonly lowStock = rxResource({
    params: () => (this.canProducts ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.catalogApi.inventory(params, '', true, 0, 8),
  });
  protected readonly labels = computed(() => (this.daily.value() ?? []).map((d) => DAY.format(new Date(d.day + 'T12:00:00'))));
  protected readonly series = computed<ChartSeries[]>(() => {
    const d = this.daily.value() ?? [];
    return d.some((x) => x.revenueMinor > 0) ? [{ name: 'Przychód', color: '#36CFA5', values: d.map((x) => x.revenueMinor / 100) }] : [];
  });
  protected readonly toFulfil = computed(() => {
    const s = this.orderStats.value();
    return s ? s.newOrders + s.processing : undefined;
  });
  protected readonly moneyAxis = (v: number) => `${Math.round(v).toLocaleString('pl-PL')} zł`;

  protected money(v: number | undefined): string | null {
    return v === undefined ? null : formatMoney(v);
  }

  protected ordersWord(n: number): string {
    return plural(n, 'zamówienie', 'zamówienia', 'zamówień');
  }

  protected count(v: number | undefined): string | null {
    return v === undefined ? null : String(v);
  }

  protected readonly firstName = computed(() => this.session.user()?.firstName ?? '');

  private readonly settings = rxResource({
    params: () => this.ctx.tenantId(),
    stream: ({ params }) => this.api.settings(params),
  });
  private readonly members = rxResource({
    params: () => (this.ctx.can('TEAM_READ') ? this.ctx.tenantId() : null),
    stream: ({ params }) => (params ? this.api.members(params) : of(null)),
  });
  private readonly invitations = rxResource({
    params: () => (this.ctx.can('TEAM_MANAGE') ? this.ctx.tenantId() : null),
    stream: ({ params }) => (params ? this.api.invitations(params) : of(null)),
  });

  protected readonly checklist = computed<ChecklistItem[]>(() => {
    const s = this.settings.value();
    const base = ['/sklep', this.ctx.tenantId()];
    const items: ChecklistItem[] = [
      { label: 'Uzupełnij dane firmy', done: !!s?.legalCompanyName && !!s?.taxId && !!s?.addressLine1, link: [...base, 'ustawienia'] },
      { label: 'Dodaj pierwszy produkt', done: (this.catalogStats.value()?.products ?? 0) > 0, link: [...base, 'produkty', 'nowy'] },
      { label: 'Włącz weryfikację dwuetapową', done: !!this.session.user()?.mfaEnabled, link: '/konto' },
    ];
    if (this.ctx.can('TEAM_MANAGE')) {
      items.push({
        label: 'Zaproś zespół',
        done: (this.members.value()?.length ?? 0) > 1 || (this.invitations.value()?.length ?? 0) > 0,
        link: [...base, 'zespol'],
      });
    }
    return items;
  });
  protected readonly doneCount = computed(() => this.checklist().filter((i) => i.done).length);
  protected readonly setupDone = computed(() => !this.settings.isLoading() && this.doneCount() === this.checklist().length);
}
