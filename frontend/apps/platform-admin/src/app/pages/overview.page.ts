import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdminApi } from '@shopivo/api-client';
import {
  AlertComponent, BadgeComponent, CardComponent, ChartSeries, DateRangeComponent, DateRangeOption, DatePipe,
  DonutChartComponent, DonutSegment, EmptyStateComponent, LineChartComponent, LoadingComponent, StatCardComponent,
} from '@shopivo/shared-ui';

const DAY_LABEL = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });
const MONTH_LABEL = new Intl.DateTimeFormat('pl-PL', { month: 'short', year: '2-digit' });

/** Platform overview — all figures come from the admin API. Revenue (MRR/ARR) arrives with the billing module. */
@Component({
  selector: 'sv-admin-overview',
  imports: [RouterLink, StatCardComponent, CardComponent, LineChartComponent, DonutChartComponent, DateRangeComponent,
    LoadingComponent, AlertComponent, BadgeComponent, EmptyStateComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-ink">Przegląd platformy</h1>
        <p class="mt-1 text-[13px] text-ink-muted"><time [attr.datetime]="isoToday">{{ today }}</time></p>
      </div>
      <sv-date-range [value]="range().value" (rangeChange)="range.set($event)" />
    </div>

    @if (overview.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać danych platformy.</sv-alert>
    }

    <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <sv-stat-card label="Użytkownicy" icon="users" tone="blue" [value]="fmt(overview.value()?.users)"
        [caption]="overview.value() ? '+' + overview.value()!.usersInPeriod + ' w okresie' : ''" />
      <sv-stat-card label="Sklepy" icon="store" tone="violet" [value]="fmt(overview.value()?.stores)"
        [caption]="overview.value() ? '+' + overview.value()!.storesInPeriod + ' w okresie' : ''" />
      <sv-stat-card label="Aktywne sklepy" icon="success" tone="green" [value]="fmt(overview.value()?.activeStores)" caption="Dostępne" />
      <sv-stat-card label="Zawieszone sklepy" icon="alert" tone="coral" [value]="fmt(overview.value()?.suspendedStores)" caption="Zablokowane" />
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <sv-card heading="Wzrost platformy" [subheading]="range().label">
        <div card-actions class="flex items-center gap-4 text-[12px] text-ink-muted">
          <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-primary"></span>Nowi użytkownicy</span>
          <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-violet"></span>Nowe sklepy</span>
        </div>
        @if (growth.isLoading() && !growth.value()) {
          <sv-loading />
        } @else {
          <sv-line-chart [labels]="labels()" [series]="series()" [height]="300" ariaLabel="Nowi użytkownicy i nowe sklepy w wybranym okresie">
            <p class="text-[12px] text-ink-muted">Brak danych w wybranym okresie</p>
          </sv-line-chart>
        }
      </sv-card>

      <sv-card heading="Ostatnio utworzone sklepy" [flush]="true">
        @if (recent.isLoading() && !recent.value()) {
          <sv-loading />
        } @else if (!recent.value()?.items?.length) {
          <sv-empty-state icon="store" title="Brak sklepów" />
        } @else {
          <ul class="px-5">
            @for (row of recent.value()!.items; track row.tenant.id) {
              <li class="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-canvas text-[13px] font-semibold text-ink-soft">
                  {{ row.tenant.name.charAt(0).toUpperCase() }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] font-medium text-ink">{{ row.tenant.name }}</p>
                  <p class="truncate text-[12px] text-ink-muted">{{ row.store?.primaryHostname }}</p>
                </div>
                <div class="text-right">
                  <sv-badge [tone]="row.tenant.status === 'ACTIVE' ? 'success' : 'danger'">{{ row.tenant.status === 'ACTIVE' ? 'Aktywny' : 'Zawieszony' }}</sv-badge>
                  <p class="mt-1 text-[11px] text-ink-muted">{{ row.tenant.createdAt | svDate: 'relative' }}</p>
                </div>
              </li>
            }
          </ul>
          <div class="border-t border-line py-3 text-center">
            <a routerLink="/sklepy" class="text-[13px] font-medium text-ink-soft hover:text-ink">Zobacz wszystkie</a>
          </div>
        }
      </sv-card>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <sv-card heading="Przychody platformy" subheading="MRR, ARR i płatności subskrypcji">
        <sv-empty-state icon="wallet" title="Dane pojawią się po uruchomieniu modułu rozliczeń" />
      </sv-card>
      <sv-card heading="Status sklepów">
        <sv-donut-chart [segments]="statusSplit()" centerLabel="Sklepy" [centerValue]="fmt(overview.value()?.stores) ?? ''"
          ariaLabel="Podział sklepów według statusu" />
      </sv-card>
    </div>
  `,
})
export class OverviewPage {
  private readonly api = inject(AdminApi);
  protected readonly today = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date());
  protected readonly isoToday = new Date().toISOString().slice(0, 10);
  protected readonly range = signal<DateRangeOption>({ value: '30d', label: 'Ostatnie 30 dni', days: 30 });

  protected readonly overview = rxResource({ params: () => this.range().days, stream: ({ params }) => this.api.overview(params) });
  protected readonly growth = rxResource({ params: () => this.range().days, stream: ({ params }) => this.api.growth(params) });
  protected readonly recent = rxResource({ stream: () => this.api.tenants('', null, 0, 5) });

  /** Long ranges are aggregated per month to keep the chart readable. */
  private readonly buckets = computed(() => {
    const g = this.growth.value();
    if (!g) return { labels: [] as string[], users: [] as number[], stores: [] as number[] };
    if (g.days.length <= 92) {
      return { labels: g.days.map((d) => DAY_LABEL.format(new Date(d))), users: g.users, stores: g.stores };
    }
    const map = new Map<string, { label: string; users: number; stores: number }>();
    g.days.forEach((d, i) => {
      const key = d.slice(0, 7);
      const entry = map.get(key) ?? { label: MONTH_LABEL.format(new Date(d)), users: 0, stores: 0 };
      entry.users += g.users[i];
      entry.stores += g.stores[i];
      map.set(key, entry);
    });
    const values = [...map.values()];
    return { labels: values.map((v) => v.label), users: values.map((v) => v.users), stores: values.map((v) => v.stores) };
  });
  protected readonly labels = computed(() => this.buckets().labels);
  protected readonly series = computed<ChartSeries[]>(() => {
    const b = this.buckets();
    if (!b.labels.length) return [];
    return [
      { name: 'Nowi użytkownicy', color: '#5B8DEF', values: b.users },
      { name: 'Nowe sklepy', color: '#A58AF7', values: b.stores },
    ];
  });
  protected readonly statusSplit = computed<DonutSegment[]>(() => {
    const o = this.overview.value();
    if (!o) return [];
    return [
      { label: 'Aktywne', value: o.activeStores, color: '#5B8DEF' },
      { label: 'Zawieszone', value: o.suspendedStores, color: '#A58AF7' },
    ];
  });

  protected fmt(value: number | undefined): string | null {
    return value === undefined ? null : value.toLocaleString('pl-PL');
  }
}
