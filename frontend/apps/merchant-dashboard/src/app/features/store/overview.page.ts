import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { SessionStore, TenantApi } from '@shopivo/api-client';
import {
  BadgeComponent, CardComponent, ChartSeries, DonutChartComponent, DonutSegment, EmptyStateComponent, LineChartComponent,
  StatCardComponent, icons,
} from '@shopivo/shared-ui';
import { of } from 'rxjs';
import { StoreContext } from './store-context';

interface ChecklistItem {
  label: string;
  done: boolean;
  link: string | unknown[];
}

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

/**
 * Store overview. Sales KPIs, charts and order/product lists are bound to the sales module (roadmap phase 3);
 * until it delivers data the widgets render explicit empty states — no sample numbers are shown.
 */
@Component({
  selector: 'sv-overview-page',
  imports: [RouterLink, LucideDynamicIcon, BadgeComponent, StatCardComponent, CardComponent, LineChartComponent, DonutChartComponent,
    EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-ink">Przegląd</h1>
        <p class="mt-1 text-[13px] text-ink-muted">Witaj, {{ firstName() }}! · <time [attr.datetime]="isoToday">{{ today }}</time></p>
      </div>
      @if (ctx.store(); as store) {
        <div class="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-card px-3 py-2 text-[13px]">
          <svg [lucideIcon]="icons.domains" [size]="16" class="shrink-0 text-ink-muted" />
          <span class="truncate font-medium text-ink">{{ store.primaryHostname }}</span>
          <sv-badge [tone]="store.status === 'PUBLISHED' ? 'success' : 'warning'">{{ store.status === 'PUBLISHED' ? 'Opublikowany' : 'Szkic' }}</sv-badge>
        </div>
      }
    </div>

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
      <sv-stat-card label="Sprzedaż" icon="cart" tone="coral" [value]="null" caption="Brak danych" />
      <sv-stat-card label="Zamówienia" icon="bag" tone="violet" [value]="null" caption="Brak danych" />
      <sv-stat-card label="Produkty" icon="box" tone="orange" [value]="null" caption="Brak danych" />
      <sv-stat-card label="Przychód" icon="dollar" tone="blue" [value]="null" caption="Brak danych" />
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <sv-card heading="Analiza sprzedaży">
        <div card-actions class="flex items-center gap-4 text-[12px] text-ink-muted">
          @for (s of salesLegend; track s.name) {
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-full" [style.background]="s.color"></span>{{ s.name }}</span>
          }
        </div>
        <sv-line-chart [labels]="months" [series]="sales" [height]="300" ariaLabel="Przychód i liczba zamówień w ostatnich 12 miesiącach">
          <p class="text-[12px] text-ink-muted">Brak sprzedaży w tym okresie</p>
        </sv-line-chart>
      </sv-card>

      <sv-card heading="Ostatnie zamówienia">
        <sv-empty-state icon="orders" title="Brak zamówień" />
      </sv-card>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <sv-card heading="Najlepiej sprzedające się produkty" [flush]="true">
        <div class="overflow-x-auto px-5 pb-2">
          <table class="sv-table min-w-[520px]">
            <thead><tr><th scope="col">Produkt</th><th scope="col">Status</th><th scope="col">Sprzedaż</th><th scope="col">Przychód</th></tr></thead>
          </table>
        </div>
        <sv-empty-state icon="products" title="Brak sprzedanych produktów" />
      </sv-card>

      <sv-card heading="Zyski miesięczne">
        <sv-donut-chart [segments]="profitSplit" centerLabel="Razem" ariaLabel="Struktura zysku w bieżącym miesiącu" />

      </sv-card>
    </div>
  `,
})
export class OverviewPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  private readonly session = inject(SessionStore);
  protected readonly icons = icons;

  protected readonly today = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date());
  protected readonly isoToday = new Date().toISOString().slice(0, 10);
  protected readonly months = lastTwelveMonths();
  /** Series are filled from the sales API once it exists (phase 3). */
  protected readonly sales: ChartSeries[] = [];
  protected readonly salesLegend = [
    { name: 'Przychód', color: '#36CFA5' },
    { name: 'Zamówienia', color: '#5B8DEF' },
  ];
  protected readonly profitSplit: DonutSegment[] = [];

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

function lastTwelveMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => MONTHS[(now.getMonth() - 11 + i + 12) % 12]);
}
