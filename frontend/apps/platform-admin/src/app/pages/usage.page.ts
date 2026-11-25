import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AdminBillingApi } from '@shopivo/api-client';
import { SUBSCRIPTION_STATUS_LABELS, UsageRow } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, CardComponent, EmptyStateComponent, FieldComponent, LoadingComponent, MoneyPipe,
  PageHeaderComponent, StatCardComponent, formatMoney, formatNumber,
} from '@shopivo/shared-ui';

/**
 * Answers "does a store cost us more than it pays?": revenue (monthly net price) against an estimated infrastructure
 * cost computed from measured usage. Fair-use excess never blocks a store — it is flagged here for an upgrade talk.
 */
@Component({
  selector: 'sv-admin-usage',
  imports: [FormsModule, PageHeaderComponent, CardComponent, BadgeComponent, AlertComponent, FieldComponent, LoadingComponent,
    EmptyStateComponent, StatCardComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Zużycie i rentowność"
      description="Przychód netto ze sklepu w porównaniu z szacowanym kosztem infrastruktury na podstawie zmierzonego ruchu.">
      <sv-field label="Miesiąc" for="usage-month" class="w-44">
        <input id="usage-month" type="month" class="sv-input" [ngModel]="month()" (ngModelChange)="month.set($event)" />
      </sv-field>
    </sv-page-header>

    @if (report.isLoading() && !report.value()) {
      <sv-loading />
    } @else if (report.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać raportu.</sv-alert>
    } @else if (report.value(); as r) {
      <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <sv-stat-card label="Przychód (netto)" icon="dollar" tone="green" [value]="money(totals().revenue)" caption="Suma cen planów w miesiącu" />
        <sv-stat-card label="Szacowany koszt" icon="chartPie" tone="orange" [value]="money(totals().cost)" caption="Model kosztów poniżej" />
        <sv-stat-card label="Sklepy na minusie" icon="alert" tone="coral" [value]="'' + totals().negative" caption="Koszt wyższy niż przychód" />
        <sv-stat-card label="Ponad limit fair use" icon="trending" tone="violet" [value]="'' + totals().fairUse" caption="Kandydaci do wyższego planu" />
      </div>

      <sv-card class="mt-4" [flush]="true">
        @if (!r.rows.length) {
          <sv-empty-state icon="analytics" title="Brak sklepów" />
        } @else {
          <div class="overflow-x-auto px-5 py-3">
            <table class="sv-table min-w-[900px]">
              <thead>
                <tr>
                  <th scope="col">Sklep</th><th scope="col">Plan</th>
                  <th scope="col" class="text-right">Odsłony</th><th scope="col" class="text-right">Zamówienia</th>
                  <th scope="col" class="text-right">Przychód</th><th scope="col" class="text-right">Koszt (szac.)</th>
                  <th scope="col" class="text-right">Marża</th>
                </tr>
              </thead>
              <tbody>
                @for (row of sorted(); track row.tenantId) {
                  <tr>
                    <td class="font-medium text-ink">{{ row.storeName }}
                      @for (m of row.fairUseExceeded; track m) {<sv-badge tone="warning" class="ml-1.5">ponad fair use</sv-badge>}
                    </td>
                    <td>{{ row.planCode }} <span class="text-ink-muted">· {{ labels[row.status] }}</span></td>
                    <td class="text-right tabular-nums">{{ usage(row, 'storefront.requests') }}</td>
                    <td class="text-right tabular-nums">{{ usage(row, 'orders') }}</td>
                    <td class="text-right tabular-nums">{{ row.revenueMonthlyNetMinor | svMoney }}</td>
                    <td class="text-right tabular-nums">{{ row.estimatedCostMinor | svMoney }}</td>
                    <td class="text-right font-medium tabular-nums" [class.text-danger-ink]="row.marginMinor < 0" [class.text-success-ink]="row.marginMinor >= 0">
                      {{ row.marginMinor | svMoney }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </sv-card>

      <sv-card class="mt-4" heading="Model kosztów" subheading="Ustawiany w konfiguracji (shopivo.billing.cost-model). Skalibruj go na podstawie faktur za chmurę.">
        <dl class="grid gap-3 text-[13px] sm:grid-cols-4">
          <div><dt class="text-ink-muted">Stały koszt sklepu / mies.</dt><dd class="font-medium text-ink">{{ r.costModel.baseMonthlyMinor | svMoney }}</dd></div>
          <div><dt class="text-ink-muted">Za 1 mln odsłon</dt><dd class="font-medium text-ink">{{ r.costModel.perMillionStorefrontRequestsMinor | svMoney }}</dd></div>
          <div><dt class="text-ink-muted">Za zamówienie</dt><dd class="font-medium text-ink">{{ r.costModel.perOrderMinor | svMoney }}</dd></div>
          <div><dt class="text-ink-muted">Za 1 GB plików</dt><dd class="font-medium text-ink">{{ r.costModel.perGbStorageMinor | svMoney }}</dd></div>
        </dl>
        <p class="mt-4 text-[12px] leading-5 text-ink-muted">
          Sklepy w okresie próbnym mają przychód 0 zł, więc zawsze są „na minusie” — to koszt pozyskania klienta. Ruch storefrontu
          jest zliczany w Redisie i zapisywany co kilka minut; liczba zamówień zacznie być mierzona wraz z modułem zamówień.
        </p>
      </sv-card>
    }
  `,
})
export class UsagePage {
  private readonly api = inject(AdminBillingApi);
  protected readonly labels = SUBSCRIPTION_STATUS_LABELS;
  protected readonly month = signal(new Date().toISOString().slice(0, 7));
  protected readonly report = rxResource({ params: () => this.month(), stream: ({ params }) => this.api.usage(params || null) });

  protected readonly sorted = computed(() => [...(this.report.value()?.rows ?? [])].sort((a, b) => a.marginMinor - b.marginMinor));
  protected readonly totals = computed(() => {
    const rows = this.report.value()?.rows ?? [];
    return {
      revenue: rows.reduce((s, r) => s + r.revenueMonthlyNetMinor, 0),
      cost: rows.reduce((s, r) => s + r.estimatedCostMinor, 0),
      negative: rows.filter((r) => r.marginMinor < 0 && r.status !== 'TRIALING').length,
      fairUse: rows.filter((r) => r.fairUseExceeded.length > 0).length,
    };
  });

  protected money(v: number): string {
    return formatMoney(v);
  }

  protected usage(row: UsageRow, metric: string): string {
    return formatNumber(row.usage[metric] ?? 0);
  }
}
