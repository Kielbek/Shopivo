import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AdminBillingApi, ApiError, SessionStore } from '@shopivo/api-client';
import {
  AdminSubscriptionRow, CHARGE_KIND_LABELS, CHARGE_STATUS_LABELS, SUBSCRIPTION_EVENT_LABELS, SUBSCRIPTION_STATUS_LABELS,
  SubscriptionStatus, formatEntitlement,
} from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, BadgeTone, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent,
  FieldComponent, LoadingComponent, MoneyPipe, PageHeaderComponent, SelectComponent, SelectOption, StatCardComponent,
  ToastService, formatMoney,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

const TONE: Record<SubscriptionStatus, BadgeTone> = {
  TRIALING: 'info', ACTIVE: 'success', PAST_DUE: 'warning', CANCELED: 'neutral', EXPIRED: 'danger',
};

@Component({
  selector: 'sv-admin-subscriptions',
  imports: [FormsModule, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent, FieldComponent,
    LoadingComponent, DialogComponent, EmptyStateComponent, SelectComponent, StatCardComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Subskrypcje" description="Stan subskrypcji sklepów. MRR liczony z cen netto aktywnych subskrypcji." />

    <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <sv-stat-card label="MRR (netto)" icon="trending" tone="green" [value]="money(stats.value()?.mrrMinor)" caption="Miesięczny przychód powtarzalny" />
      <sv-stat-card label="ARR (netto)" icon="chartLine" tone="blue" [value]="money(stats.value()?.arrMinor)" caption="MRR × 12" />
      <sv-stat-card label="Okresy próbne" icon="calendar" tone="violet" [value]="count('TRIALING')"
        [caption]="stats.value() ? stats.value()!.trialsEndingIn7Days + ' kończy się w 7 dni' : ''" />
      <sv-stat-card label="Zaległe płatności" icon="alert" tone="coral" [value]="count('PAST_DUE')"
        [caption]="stats.value() ? 'Do zapłaty: ' + money(stats.value()!.unpaidTotalMinor) : ''" />
    </div>

    <sv-card class="mt-4" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center">
        <input class="sv-input sm:max-w-xs" type="search" placeholder="Szukaj sklepu…" aria-label="Szukaj sklepu"
          [ngModel]="query()" (ngModelChange)="query.set($event)" />
        <sv-select class="sm:w-56" [options]="statusOptions" [value]="status()" (valueChange)="status.set($any($event))" ariaLabel="Status" />
      </div>
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać subskrypcji.</sv-alert></div>
      } @else if (!rows.value()?.length) {
        <sv-empty-state icon="wallet" title="Brak subskrypcji" />
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[820px]">
            <thead><tr><th scope="col">Sklep</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col" class="text-right">MRR</th><th scope="col">Koniec okresu</th><th scope="col" class="text-right">Zaległość</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
            <tbody>
              @for (r of rows.value(); track r.tenantId) {
                <tr>
                  <td class="font-medium text-ink">{{ r.storeName }}</td>
                  <td>{{ r.planName }}@if (r.interval) {<span class="text-ink-muted"> · {{ r.interval === 'YEAR' ? 'rocznie' : 'miesięcznie' }}</span>}</td>
                  <td>
                    <sv-badge [tone]="tone[r.status]">{{ labels[r.status] }}</sv-badge>
                    @if (r.cancelAtPeriodEnd) {<sv-badge class="ml-1">Rezygnacja</sv-badge>}
                  </td>
                  <td class="text-right tabular-nums">{{ (r.status === 'ACTIVE' || r.status === 'PAST_DUE') ? (r.monthlyNetMinor | svMoney) : '—' }}</td>
                  <td class="whitespace-nowrap text-ink-soft">{{ (r.status === 'TRIALING' ? r.trialEndsAt : r.currentPeriodEnd) | svDate: 'date' }}</td>
                  <td class="text-right tabular-nums" [class.text-danger-ink]="r.unpaidTotalMinor > 0">{{ r.unpaidTotalMinor ? (r.unpaidTotalMinor | svMoney) : '—' }}</td>
                  <td class="text-right"><button sv-button variant="ghost" size="sm" (click)="selected.set(r)">Szczegóły</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </sv-card>

    <sv-dialog [heading]="selected()?.storeName ?? ''" [open]="!!selected()" (closed)="selected.set(null)">
      @if (detail.isLoading() && !detail.value()) {
        <sv-loading />
      } @else if (detail.error()) {
        <sv-alert tone="error">Nie udało się wczytać szczegółów.</sv-alert>
      } @else if (detail.value(); as d) {
        <div class="space-y-5 text-[13px]">
          <div class="flex flex-wrap items-center gap-2">
            <sv-badge [tone]="tone[d.subscription.status]">{{ labels[d.subscription.status] }}</sv-badge>
            <span>Plan <strong class="font-medium text-ink">{{ d.subscription.plan?.name }}</strong></span>
            @if (d.subscription.status === 'TRIALING') {<span class="text-ink-muted">próba do {{ d.subscription.trialEndsAt | svDate: 'date' }}</span>}
            @if (d.subscription.currentPeriodEnd) {<span class="text-ink-muted">okres do {{ d.subscription.currentPeriodEnd | svDate: 'date' }}</span>}
          </div>

          @if (isAdmin && (d.subscription.status === 'TRIALING' || (d.subscription.status === 'EXPIRED' && !d.subscription.currentPeriodEnd))) {
            <form class="grid gap-3 rounded-[var(--radius-control)] bg-canvas p-4 sm:grid-cols-[110px_1fr_auto] sm:items-end" (ngSubmit)="extend()">
              <sv-field label="Dni" for="ext-days"><input id="ext-days" name="days" type="number" min="1" max="90" class="sv-input" [(ngModel)]="extendDays" /></sv-field>
              <sv-field label="Powód" for="ext-reason"><input id="ext-reason" name="reason" class="sv-input" maxlength="300" [(ngModel)]="extendReason" /></sv-field>
              <button sv-button type="submit" size="sm" [loading]="busy()">Przedłuż próbę</button>
            </form>
          }

          <section>
            <h3 class="font-semibold text-ink">Limity</h3>
            <table class="sv-table mt-2">
              <tbody>
                @for (e of d.subscription.entitlements; track e.key) {
                  <tr>
                    <td class="text-ink-soft">{{ e.label }}</td>
                    <td class="text-right font-medium">{{ fmt(e.kind, e.value, e.key) }}@if (e.overridden) {<sv-badge tone="violet" class="ml-1.5">wyjątek</sv-badge>}</td>
                    @if (isAdmin) {
                      <td class="w-24 text-right">
                        @if (e.overridden) {
                          <button sv-button variant="ghost" size="sm" (click)="removeOverride(e.key)">Usuń</button>
                        } @else {
                          <button sv-button variant="ghost" size="sm" (click)="startOverride(e.key, e.value)">Zmień</button>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
            @if (override(); as o) {
              <form class="mt-3 grid gap-3 rounded-[var(--radius-control)] bg-canvas p-4 sm:grid-cols-2" (ngSubmit)="saveOverride()">
                <p class="font-medium text-ink sm:col-span-2">Wyjątek: {{ o.label }}</p>
                <sv-field label="Wartość (-1 = bez limitu; tak/nie: true/false)" for="ov-value"><input id="ov-value" name="value" class="sv-input" [(ngModel)]="o.value" /></sv-field>
                <sv-field label="Wygasa" for="ov-exp" [optional]="true"><input id="ov-exp" name="exp" type="date" class="sv-input" [(ngModel)]="o.expires" /></sv-field>
                <sv-field label="Powód" for="ov-reason" class="sm:col-span-2"><input id="ov-reason" name="reason" class="sv-input" maxlength="300" [(ngModel)]="o.reason" /></sv-field>
                <div class="flex gap-2 sm:col-span-2">
                  <button sv-button type="submit" size="sm" [loading]="busy()">Zapisz wyjątek</button>
                  <button sv-button type="button" variant="secondary" size="sm" (click)="override.set(null)">Anuluj</button>
                </div>
              </form>
            }
          </section>

          <section>
            <h3 class="font-semibold text-ink">Płatności</h3>
            @if (!d.charges.length) {<p class="mt-1 text-ink-muted">Brak płatności.</p>}
            @else {
              <ul class="mt-2 divide-y divide-line">
                @for (c of d.charges; track c.id) {
                  <li class="flex items-center justify-between gap-3 py-2">
                    <span>{{ c.number }} · {{ kindLabels[c.kind] }} · {{ c.plan?.name }}</span>
                    <span class="flex items-center gap-2 tabular-nums">{{ c.totalMinor | svMoney }}<sv-badge [tone]="c.status === 'PAID' ? 'success' : c.status === 'VOID' ? 'neutral' : 'warning'">{{ chargeLabels[c.status] }}</sv-badge></span>
                  </li>
                }
              </ul>
            }
          </section>

          <section>
            <h3 class="font-semibold text-ink">Historia</h3>
            <ol class="mt-2 divide-y divide-line">
              @for (h of d.history; track $index) {
                <li class="flex justify-between gap-3 py-2">
                  <span>{{ eventLabels[h.type] ?? h.type }}@if (h.detail && h.type === 'TRIAL_EXTENDED') {<span class="text-ink-muted"> — {{ h.detail }}</span>}</span>
                  <time class="shrink-0 text-ink-muted">{{ h.createdAt | svDate }}</time>
                </li>
              }
            </ol>
          </section>
        </div>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="selected.set(null)">Zamknij</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class SubscriptionsPage {
  private readonly api = inject(AdminBillingApi);
  private readonly toast = inject(ToastService);
  protected readonly isAdmin = inject(SessionStore).user()?.platformRole === 'PLATFORM_ADMIN';
  protected readonly labels = SUBSCRIPTION_STATUS_LABELS;
  protected readonly tone = TONE;
  protected readonly chargeLabels = CHARGE_STATUS_LABELS;
  protected readonly kindLabels = CHARGE_KIND_LABELS;
  protected readonly eventLabels = SUBSCRIPTION_EVENT_LABELS;
  protected readonly fmt = formatEntitlement;
  protected readonly statusOptions: SelectOption[] = [
    { value: '', label: 'Wszystkie statusy' },
    ...(Object.keys(SUBSCRIPTION_STATUS_LABELS) as SubscriptionStatus[]).map((s) => ({ value: s, label: SUBSCRIPTION_STATUS_LABELS[s] })),
  ];

  protected readonly query = signal('');
  protected readonly status = signal<SubscriptionStatus | ''>('');
  protected readonly selected = signal<AdminSubscriptionRow | null>(null);
  protected readonly busy = signal(false);
  protected readonly override = signal<{ key: string; label: string; value: string; reason: string; expires: string } | null>(null);
  protected extendDays = 7;
  protected extendReason = '';

  protected readonly stats = rxResource({ stream: () => this.api.stats() });
  protected readonly rows = rxResource({
    params: () => ({ status: this.status() || null, q: this.query() }),
    stream: ({ params }) => this.api.subscriptions(params.status, params.q),
  });
  protected readonly detail = rxResource({
    params: () => this.selected()?.tenantId,
    stream: ({ params }) => this.api.subscription(params),
  });

  protected readonly money = (v: number | null | undefined) => (v === undefined ? null : formatMoney(v));
  protected count(status: SubscriptionStatus): string | null {
    const stats = this.stats.value();
    return stats ? String(stats.byStatus[status] ?? 0) : null;
  }

  protected startOverride(key: string, value: string): void {
    const label = this.detail.value()?.subscription.entitlements.find((e) => e.key === key)?.label ?? key;
    this.override.set({ key, label, value, reason: '', expires: '' });
  }

  protected async saveOverride(): Promise<void> {
    const o = this.override();
    const tenantId = this.selected()?.tenantId;
    if (!o || !tenantId) return;
    await this.run(() => this.api.setOverride(tenantId, o.key, o.value.trim(), o.reason.trim(),
      o.expires ? new Date(o.expires + 'T23:59:59').toISOString() : null), 'Zapisano wyjątek.');
    this.override.set(null);
  }

  protected async removeOverride(key: string): Promise<void> {
    const tenantId = this.selected()?.tenantId;
    if (tenantId) await this.run(() => this.api.removeOverride(tenantId, key), 'Usunięto wyjątek.');
  }

  protected async extend(): Promise<void> {
    const tenantId = this.selected()?.tenantId;
    if (!tenantId) return;
    await this.run(() => this.api.extendTrial(tenantId, Number(this.extendDays), this.extendReason.trim()),
      `Przedłużono okres próbny o ${this.extendDays} dni.`);
    this.extendReason = '';
  }

  private async run(action: () => import('rxjs').Observable<unknown>, success: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(action());
      this.toast.success(success);
      this.detail.reload();
      this.rows.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
