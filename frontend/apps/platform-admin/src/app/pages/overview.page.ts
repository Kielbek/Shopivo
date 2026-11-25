import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApi } from '@shopivo/api-client';
import { AlertComponent, LoadingComponent, PageHeaderComponent } from '@shopivo/shared-ui';

@Component({
  selector: 'sv-admin-overview',
  imports: [PageHeaderComponent, LoadingComponent, AlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Przegląd platformy" description="Bieżący stan kont i sklepów. Dane rozliczeniowe (MRR/ARR) pojawią się wraz z modułem subskrypcji." />
    @if (overview.isLoading()) {
      <sv-loading />
    } @else if (overview.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać danych.</sv-alert>
    } @else if (overview.value(); as o) {
      <dl class="mt-6 grid gap-px overflow-hidden rounded-[var(--radius-ui)] border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
        @for (stat of [
          { label: 'Użytkownicy', value: o.users, note: '+' + o.usersLast30Days + ' w ostatnich 30 dniach' },
          { label: 'Sklepy', value: o.stores, note: '+' + o.storesLast30Days + ' w ostatnich 30 dniach' },
          { label: 'Aktywne sklepy', value: o.activeStores, note: 'Dostępne dla sprzedawców' },
          { label: 'Zawieszone sklepy', value: o.suspendedStores, note: 'Zablokowane przez administrację' }
        ]; track stat.label) {
          <div class="bg-white p-5">
            <dt class="text-[12px] font-medium uppercase tracking-wide text-zinc-500">{{ stat.label }}</dt>
            <dd class="mt-2 text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{{ stat.value.toLocaleString('pl-PL') }}</dd>
            <dd class="mt-1 text-[12px] text-zinc-500">{{ stat.note }}</dd>
          </div>
        }
      </dl>
    }
  `,
})
export class OverviewPage {
  private readonly api = inject(AdminApi);
  protected readonly overview = rxResource({ stream: () => this.api.overview() });
}
