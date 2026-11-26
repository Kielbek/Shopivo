import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, BillingApi } from '@shopivo/api-client';
import {
  BillingInterval, CHARGE_KIND_LABELS, CHARGE_STATUS_LABELS, Charge, ChargeStatus, Plan, PlanPrice, SUBSCRIPTION_EVENT_LABELS,
  SUBSCRIPTION_STATUS_LABELS, Subscription, SubscriptionStatus, formatEntitlement,
} from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, BadgeTone, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent,
  FieldComponent, LoadingComponent, MoneyPipe, PageHeaderComponent, TabOption, TabsComponent, ToastService, formatMoney, isSafeRedirectUrl,
  formatNumber, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from './store-context';

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  TRIALING: 'info', ACTIVE: 'success', PAST_DUE: 'warning', CANCELED: 'neutral', EXPIRED: 'danger',
};
const CHARGE_TONE: Record<ChargeStatus, BadgeTone> = { OPEN: 'warning', PAID: 'success', FAILED: 'danger', VOID: 'neutral' };

/** Entitlements shown on plan cards, in this order. */
const HIGHLIGHTS = ['products.max', 'staff.max', 'storage.max_mb', 'orders.monthly.fair_use', 'domains.custom', 'marketing.tools',
  'integrations.external', 'analytics.advanced', 'ai.monthly_credits', 'support.priority'];

type Dialog =
  | { kind: 'checkout'; plan: Plan; price: PlanPrice }
  | { kind: 'change'; plan: Plan; price: PlanPrice; immediate: boolean }
  | { kind: 'cancel' };

@Component({
  selector: 'sv-subscription-page',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, TabsComponent, DialogComponent, FieldComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Subskrypcja"
      description="Plan sklepu, płatności i limity. Ceny planów są cenami netto — do płatności doliczamy VAT." />

    @if (confirming()) {
      <sv-alert tone="info" heading="Czekamy na potwierdzenie płatności" class="mt-6">
        Operator płatności przekazuje nam potwierdzenie zwykle w ciągu kilku sekund. Ta strona odświeży się sama.
      </sv-alert>
    }

    @if (sub.isLoading() && !sub.value()) {
      <sv-loading class="mt-2" variant="detail" label="Wczytywanie subskrypcji…" />
    } @else if (sub.error() && !sub.value()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać subskrypcji.</sv-alert>
    } @else if (sub.value(); as s) {
      <!-- Current state -->
      <sv-card class="mt-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-[18px] font-semibold text-ink">Plan {{ s.plan?.name }}</h2>
              <sv-badge [tone]="statusTone[s.status]">{{ statusLabels[s.status] }}</sv-badge>
              @if (s.access === 'READ_ONLY') {<sv-badge tone="danger">Tylko do odczytu</sv-badge>}
            </div>
            <p class="mt-1.5 max-w-2xl text-[13px] leading-5 text-ink-soft">{{ summary() }}</p>
            @if (s.pendingPlan) {
              <p class="mt-2 flex items-center gap-1.5 text-[13px] text-ink-soft">
                <svg [lucideIcon]="icons.calendar" [size]="15" class="text-ink-muted" />
                Od {{ s.currentPeriodEnd | svDate: 'date' }} plan zmieni się na <strong class="font-medium text-ink">{{ s.pendingPlan.name }}</strong>.
              </p>
            }
            @if (s.coupon) {
              <p class="mt-2 flex items-center gap-1.5 text-[13px] text-ink-soft">
                <svg [lucideIcon]="icons.discount" [size]="15" class="text-ink-muted" />Kod rabatowy {{ s.coupon.code }}
              </p>
            }
          </div>
          <dl class="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3 lg:grid-cols-2">
            @if (s.price) {
              <div><dt class="text-ink-muted">Cena</dt><dd class="mt-0.5 font-medium text-ink">{{ s.price.amountMinor | svMoney }} netto / {{ s.interval === 'YEAR' ? 'rok' : 'mies.' }}</dd></div>
            }
            @if (s.status === 'TRIALING') {
              <div><dt class="text-ink-muted">Koniec okresu próbnego</dt><dd class="mt-0.5 font-medium text-ink">{{ s.trialEndsAt | svDate: 'date' }}</dd></div>
            }
            @if (s.currentPeriodEnd && (s.status === 'ACTIVE' || s.status === 'PAST_DUE')) {
              <div><dt class="text-ink-muted">{{ s.cancelAtPeriodEnd ? 'Aktywna do' : 'Następne odnowienie' }}</dt><dd class="mt-0.5 font-medium text-ink">{{ s.currentPeriodEnd | svDate: 'date' }}</dd></div>
            }
            @if (s.status === 'PAST_DUE') {
              <div><dt class="text-ink-muted">Sklep działa do</dt><dd class="mt-0.5 font-medium text-warning-ink">{{ s.graceUntil | svDate: 'date' }}</dd></div>
            }
          </dl>
        </div>

        @if (s.unpaidCharges.length) {
          <div class="mt-5 space-y-2 border-t border-line pt-4">
            @for (c of s.unpaidCharges; track c.id) {
              <div class="flex flex-col gap-3 rounded-[var(--radius-control)] bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0 text-[13px]">
                  <p class="font-medium text-ink">{{ kindLabels[c.kind] }} — {{ c.plan?.name }} · {{ c.totalMinor | svMoney }} brutto</p>
                  <p class="text-ink-muted">{{ c.number }} · okres {{ c.periodStart | svDate: 'date' }} – {{ c.periodEnd | svDate: 'date' }}
                    @if (c.status === 'FAILED') {<span class="text-danger-ink"> · poprzednia próba nieudana</span>}</p>
                </div>
                @if (canManage) {
                  <button sv-button size="sm" class="shrink-0" [loading]="paying() === c.id" [disabled]="!s.paymentsAvailable" (click)="pay(c)">
                    <svg [lucideIcon]="icons.payments" />Zapłać
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (canManage && (s.status === 'ACTIVE' || s.status === 'TRIALING' || s.status === 'PAST_DUE')) {
          <div class="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            @if (s.cancelAtPeriodEnd) {
              <button sv-button variant="secondary" size="sm" [loading]="busy()" (click)="resume()">Wznów subskrypcję</button>
            } @else {
              <button sv-button variant="ghost" size="sm" (click)="dialog.set({ kind: 'cancel' })">
                {{ s.status === 'TRIALING' ? 'Nie kontynuuj po okresie próbnym' : 'Zakończ subskrypcję' }}
              </button>
            }
          </div>
        }
      </sv-card>

      @if (!s.paymentsAvailable && canManage) {
        <sv-alert tone="warning" class="mt-4">Płatności za subskrypcje są chwilowo niedostępne. Spróbuj później lub skontaktuj się z obsługą Shopivo.</sv-alert>
      }
      @if (!canManage) {
        <sv-alert tone="info" class="mt-4">Subskrypcją zarządza właściciel sklepu.</sv-alert>
      }

      <sv-tabs class="mt-6" label="Sekcje subskrypcji" [tabs]="tabs" [(active)]="tab" />

      @if (tab() === 'plan') {
        <div role="tabpanel" id="panel-plan" aria-labelledby="tab-plan">
          <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-[15px] font-semibold text-ink">Plany</h2>
            <sv-tabs label="Okres rozliczeniowy" [tabs]="intervals" [(active)]="interval" />
          </div>

          @if (plans.isLoading() && !plans.value()) {
            <sv-loading />
          } @else if (plans.value(); as p) {
            <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              @for (plan of p.plans; track plan.id) {
                @let price = priceFor(plan);
                @let current = isCurrent(plan);
                <section class="sv-card flex flex-col p-5" [class.ring-2]="current" [class.ring-primary]="current"
                  [attr.aria-label]="'Plan ' + plan.name">
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="text-[16px] font-semibold text-ink">{{ plan.name }}</h3>
                    @if (current) {<sv-badge tone="brand">Twój plan</sv-badge>}
                    @else if (s.pendingPlan?.id === plan.id) {<sv-badge tone="violet">Od następnego okresu</sv-badge>}
                  </div>
                  @if (plan.description) {<p class="mt-1 min-h-10 text-[13px] leading-5 text-ink-muted">{{ plan.description }}</p>}
                  @if (price) {
                    <p class="mt-4 flex items-baseline gap-1">
                      <span class="text-[26px] font-semibold tracking-[-0.02em] text-ink tabular-nums">{{ price.monthlyAmountMinor | svMoney }}</span>
                      <span class="text-[13px] text-ink-muted">netto / mies.</span>
                    </p>
                    <p class="text-[12px] text-ink-muted">
                      @if (price.interval === 'YEAR') {Płatne rocznie: {{ price.amountMinor | svMoney }} netto}
                      @else {{{ gross(price.amountMinor) }} z VAT}
                    </p>
                  } @else {
                    <p class="mt-4 text-[13px] text-ink-muted">Niedostępny w tym okresie rozliczeniowym.</p>
                  }
                  <ul class="mt-4 flex-1 space-y-2 border-t border-line pt-4 text-[13px]">
                    @for (key of highlights; track key) {
                      @if (definition(key); as d) {
                        @let v = plan.entitlements[key];
                        <li class="flex items-start gap-2" [class.text-ink-muted]="d.kind === 'FEATURE' && v !== 'true'">
                          <svg [lucideIcon]="d.kind === 'FEATURE' && v !== 'true' ? icons.close : icons.check" [size]="15"
                            [class]="'mt-0.5 shrink-0 ' + (d.kind === 'FEATURE' && v !== 'true' ? 'text-ink-muted' : 'text-success-ink')" />
                          <span>
                            @if (d.kind === 'FEATURE') {{{ d.label }}}
                            @else {{{ d.label }}: <strong class="font-medium text-ink">{{ format(d.kind, v, key) }}</strong>}
                          </span>
                        </li>
                      }
                    }
                  </ul>
                  @if (canManage && price) {
                    <div class="mt-5">
                      @switch (actionFor(plan)) {
                        @case ('current') {<button sv-button variant="secondary" [block]="true" [disabled]="true">Obecny plan</button>}
                        @case ('checkout') {
                          <button sv-button [block]="true" [disabled]="!s.paymentsAvailable" (click)="openCheckout(plan, price)">Wybierz {{ plan.name }}</button>
                        }
                        @case ('change') {
                          <button sv-button variant="secondary" [block]="true" [disabled]="!s.paymentsAvailable && isUpgrade(plan, price)"
                            (click)="openChange(plan, price)">{{ isUpgrade(plan, price) ? 'Przejdź wyżej' : 'Przejdź na ten plan' }}</button>
                        }
                        @case ('blocked') {<button sv-button variant="secondary" [block]="true" [disabled]="true">Najpierw opłać zaległość</button>}
                      }
                    </div>
                  }
                </section>
              }
            </div>
            <p class="mt-3 text-[12px] text-ink-muted">
              Limity oznaczone jako „uczciwe użytkowanie” nigdy nie blokują sklepu ani zakupów Twoich klientów — po ich
              przekroczeniu poinformujemy Cię i zaproponujemy wyższy plan.
            </p>
          }

          <div class="mt-6 grid items-start gap-4 xl:grid-cols-2">
            <sv-card heading="Wykorzystanie w tym miesiącu">
              @if (!s.usage.length) {
                <p class="text-[13px] text-ink-muted">Brak danych.</p>
              } @else {
                <ul class="space-y-4">
                  @for (u of s.usage; track u.metric) {
                    <li>
                      <div class="flex items-baseline justify-between gap-3 text-[13px]">
                        <span class="text-ink-soft">{{ u.label }}@if (u.fairUse) {<span class="text-ink-muted"> · uczciwe użytkowanie</span>}</span>
                        <span class="shrink-0 whitespace-nowrap font-medium tabular-nums text-ink">{{ number(u.value) }} / {{ u.limit === -1 ? 'bez limitu' : number(u.limit) }}</span>
                      </div>
                      @if (u.limit > 0) {
                        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas" role="progressbar" [attr.aria-valuenow]="u.value"
                          aria-valuemin="0" [attr.aria-valuemax]="u.limit" [attr.aria-label]="u.label">
                          <div class="h-full rounded-full" [class]="u.value > u.limit ? 'bg-warning' : 'bg-primary'"
                            [style.width.%]="percent(u.value, u.limit)"></div>
                        </div>
                      }
                    </li>
                  }
                </ul>
              }
            </sv-card>
            <sv-card heading="Limity Twojego planu">
              <dl class="divide-y divide-line text-[13px]">
                @for (e of s.entitlements; track e.key) {
                  <div class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <dt class="text-ink-soft">{{ e.label }}</dt>
                    <dd class="flex items-center gap-2 font-medium text-ink">
                      @if (e.overridden) {<sv-badge tone="violet">indywidualnie</sv-badge>}
                      {{ format(e.kind, e.value, e.key) }}
                    </dd>
                  </div>
                }
              </dl>
            </sv-card>
          </div>
        </div>
      }

      @if (tab() === 'payments') {
        <div role="tabpanel" id="panel-payments" aria-labelledby="tab-payments">
          <sv-card class="mt-5" heading="Płatności" subheading="Kwoty brutto (z VAT)." [flush]="true">
            @if (!canManage) {
              <p class="px-5 pb-5 text-[13px] text-ink-muted">Historia płatności jest dostępna dla właściciela sklepu.</p>
            } @else if (charges.isLoading() && !charges.value()) {
              <sv-loading />
            } @else if (!charges.value()?.length) {
              <sv-empty-state icon="receipt" title="Brak płatności" description="Tu pojawią się płatności za subskrypcję." />
            } @else {
              <div class="overflow-x-auto px-5 pb-3">
                <table class="sv-table min-w-[680px]">
                  <thead><tr><th scope="col">Numer</th><th scope="col">Rodzaj</th><th scope="col">Okres</th><th scope="col" class="text-right">Kwota</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
                  <tbody>
                    @for (c of charges.value(); track c.id) {
                      <tr>
                        <td class="whitespace-nowrap font-medium">{{ c.number }}</td>
                        <td>{{ kindLabels[c.kind] }} · {{ c.plan?.name }}</td>
                        <td class="whitespace-nowrap text-ink-soft">{{ c.periodStart | svDate: 'date' }} – {{ c.periodEnd | svDate: 'date' }}</td>
                        <td class="whitespace-nowrap text-right tabular-nums">
                          {{ c.totalMinor | svMoney }}
                          @if (c.discountMinor > 0) {<span class="block text-[11px] text-ink-muted">rabat {{ c.discountMinor | svMoney }} netto</span>}
                        </td>
                        <td><sv-badge [tone]="chargeTone[c.status]">{{ chargeLabels[c.status] }}</sv-badge>
                          @if (c.paidAt) {<span class="block text-[11px] text-ink-muted">{{ c.paidAt | svDate: 'date' }}</span>}</td>
                        <td class="text-right">
                          @if (c.status === 'OPEN' || c.status === 'FAILED') {
                            <button sv-button size="sm" variant="secondary" [loading]="paying() === c.id" (click)="pay(c)">Zapłać</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="px-5 pb-4 text-[12px] text-ink-muted">Zestawienie płatności nie jest fakturą VAT.</p>
            }
          </sv-card>
        </div>
      }

      @if (tab() === 'history') {
        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history">
          <sv-card class="mt-5" heading="Historia subskrypcji" [flush]="true">
            @if (!canManage) {
              <p class="px-5 pb-5 text-[13px] text-ink-muted">Historia jest dostępna dla właściciela sklepu.</p>
            } @else if (history.isLoading() && !history.value()) {
              <sv-loading />
            } @else if (!history.value()?.length) {
              <sv-empty-state icon="audit" title="Brak zdarzeń" />
            } @else {
              <ol class="px-5 pb-4">
                @for (h of history.value(); track $index) {
                  <li class="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
                    <div class="min-w-0 text-[13px]">
                      <p class="font-medium text-ink">{{ eventLabels[h.type] ?? h.type }}</p>
                      @if (h.planCode) {<p class="text-ink-muted">Plan {{ h.planCode }}</p>}
                    </div>
                    <time class="shrink-0 text-[12px] text-ink-muted" [attr.datetime]="h.createdAt">{{ h.createdAt | svDate }}</time>
                  </li>
                }
              </ol>
            }
          </sv-card>
        </div>
      }
    }

    <!-- Dialogs -->
    @let d = dialog();
    <sv-dialog [heading]="dialogHeading()" [open]="!!d" (closed)="closeDialog()">
      @if (d?.kind === 'checkout' && d.kind === 'checkout') {
        <div class="space-y-4">
          @if (sub.value()?.status === 'TRIALING') {
            <p>Okres próbny trwa do {{ sub.value()?.trialEndsAt | svDate: 'date' }}. Płatny okres zacznie się po jego zakończeniu — nie tracisz pozostałych dni.</p>
          } @else {
            <p>Plan zacznie działać zaraz po zaksięgowaniu płatności.</p>
          }
          <dl class="space-y-1.5 rounded-[var(--radius-control)] bg-canvas p-4 text-[13px]">
            <div class="flex justify-between"><dt class="text-ink-soft">Plan {{ d.plan.name }} ({{ d.price.interval === 'YEAR' ? 'rocznie' : 'miesięcznie' }})</dt><dd class="tabular-nums">{{ d.price.amountMinor | svMoney }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-soft">VAT {{ vatPercent() }}%</dt><dd class="tabular-nums">{{ vat(d.price.amountMinor) | svMoney }}</dd></div>
            <div class="flex justify-between border-t border-line pt-1.5 font-semibold text-ink"><dt>Do zapłaty</dt><dd class="tabular-nums">{{ d.price.amountMinor + vat(d.price.amountMinor) | svMoney }}</dd></div>
          </dl>
          <sv-field label="Kod rabatowy" for="coupon" [optional]="true" hint="Rabat zostanie naliczony przy płatności.">
            <input id="coupon" class="sv-input uppercase" [(ngModel)]="coupon" maxlength="40" autocomplete="off" />
          </sv-field>
          @if (dialogError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
          <p class="text-[12px] text-ink-muted">Przekierujemy Cię do operatora płatności (BLIK, przelew, karta).</p>
        </div>
      } @else if (d?.kind === 'change' && d.kind === 'change') {
        <div class="space-y-3">
          @if (d.immediate) {
            <p>Plan <strong class="font-medium text-ink">{{ d.plan.name }}</strong> zacznie działać od razu po płatności. Od ceny
              odejmiemy niewykorzystaną część bieżącego okresu — dokładną kwotę zobaczysz u operatora płatności.</p>
          } @else {
            <p>Plan <strong class="font-medium text-ink">{{ d.plan.name }}</strong> zacznie obowiązywać od
              {{ sub.value()?.currentPeriodEnd | svDate: 'date' }}. Do tego dnia korzystasz z obecnego planu.</p>
            <p class="text-[13px] text-ink-muted">Sprawdź, czy sklep mieści się w limitach nowego planu (np. liczba osób w zespole).</p>
          }
          @if (dialogError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
        </div>
      } @else if (d?.kind === 'cancel') {
        <div class="space-y-3">
          @if (sub.value()?.status === 'TRIALING') {
            <p>Po zakończeniu okresu próbnego ({{ sub.value()?.trialEndsAt | svDate: 'date' }}) sklep przejdzie w tryb tylko do odczytu.</p>
          } @else if (sub.value()?.status === 'PAST_DUE') {
            <p>Subskrypcja zakończy się od razu, a sklep przejdzie w tryb tylko do odczytu.</p>
          } @else {
            <p>Subskrypcja pozostanie aktywna do {{ sub.value()?.currentPeriodEnd | svDate: 'date' }}. Potem sklep przejdzie w tryb
              tylko do odczytu i będzie niedostępny dla klientów. Dane zachowamy — możesz wrócić w każdej chwili.</p>
          }
          @if (dialogError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
        </div>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="closeDialog()">Anuluj</button>
        @if (d?.kind === 'cancel') {
          <button sv-button variant="danger" type="button" [loading]="busy()" (click)="cancel()">Zakończ subskrypcję</button>
        } @else {
          <button sv-button type="button" [loading]="busy()" (click)="confirm()">
            {{ d?.kind === 'change' && !$any(d).immediate ? 'Zaplanuj zmianę' : 'Przejdź do płatności' }}
          </button>
        }
      </ng-container>
    </sv-dialog>
  `,
})
export class SubscriptionPage implements OnInit {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly icons = icons;

  /** Set by the payment operator's return redirect (`?platnosc=<chargeId>`). */
  readonly platnosc = input<string>();

  protected readonly statusLabels = SUBSCRIPTION_STATUS_LABELS;
  protected readonly statusTone = STATUS_TONE;
  protected readonly chargeLabels = CHARGE_STATUS_LABELS;
  protected readonly chargeTone = CHARGE_TONE;
  protected readonly kindLabels = CHARGE_KIND_LABELS;
  protected readonly eventLabels = SUBSCRIPTION_EVENT_LABELS;
  protected readonly highlights = HIGHLIGHTS;
  protected readonly canManage = this.ctx.can('BILLING_MANAGE');

  protected readonly tabs: TabOption[] = [
    { id: 'plan', label: 'Plan i limity' }, { id: 'payments', label: 'Płatności' }, { id: 'history', label: 'Historia' },
  ];
  protected readonly intervals: TabOption[] = [{ id: 'MONTH', label: 'Miesięcznie' }, { id: 'YEAR', label: 'Rocznie' }];
  protected readonly tab = signal('plan');
  protected readonly interval = signal<string>('MONTH');
  protected coupon = '';

  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly paying = signal<string | null>(null);
  protected readonly confirming = signal(false);

  protected readonly sub = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.subscription(params) });
  protected readonly plans = rxResource({ stream: () => this.api.plans() });
  protected readonly charges = rxResource({
    params: () => (this.canManage && this.tab() === 'payments' ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.api.charges(params),
  });
  protected readonly history = rxResource({
    params: () => (this.canManage && this.tab() === 'history' ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.api.history(params),
  });

  protected readonly vatPercent = computed(() => (this.sub.value()?.vatRateBps ?? 2300) / 100);

  protected readonly summary = computed(() => {
    const s = this.sub.value();
    if (!s) return '';
    const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(new Date(iso)) : '—');
    switch (s.status) {
      case 'TRIALING':
        return s.cancelAtPeriodEnd
          ? `Okres próbny kończy się ${date(s.trialEndsAt)} i nie będzie kontynuowany.`
          : `Korzystasz z pełnych możliwości planu ${s.plan?.name} za darmo do ${date(s.trialEndsAt)}. Wybierz plan, aby sklep działał dalej.`;
      case 'ACTIVE':
        return s.cancelAtPeriodEnd
          ? `Subskrypcja zakończy się ${date(s.currentPeriodEnd)}. Do tego dnia wszystko działa normalnie.`
          : `Subskrypcja odnowi się ${date(s.currentPeriodEnd)}. Płatność za kolejny okres pojawi się tydzień wcześniej.`;
      case 'PAST_DUE':
        return `Płatność za bieżący okres nie wpłynęła. Sklep działa do ${date(s.graceUntil)} — opłać subskrypcję, aby uniknąć przerwy.`;
      case 'CANCELED':
        return 'Subskrypcja została zakończona. Sklep jest w trybie tylko do odczytu — wybierz plan, aby wrócić.';
      case 'EXPIRED':
        return 'Subskrypcja wygasła. Sklep jest w trybie tylko do odczytu i jest niedostępny dla klientów. Twoje dane są bezpieczne.';
    }
  });

  protected readonly dialogHeading = computed(() => {
    const d = this.dialog();
    if (!d) return '';
    if (d.kind === 'cancel') return 'Zakończyć subskrypcję?';
    if (d.kind === 'checkout') return `Plan ${d.plan.name}`;
    return d.immediate ? `Zmiana planu na ${d.plan.name}` : `Zmiana planu od następnego okresu`;
  });

  constructor() {
    // Default the interval toggle to the current one.
    effect(() => {
      const s = this.sub.value();
      if (s?.interval) this.interval.set(s.interval);
    });
    effect(() => {
      const s = this.sub.value();
      if (s) this.ctx.setSubscription(s);
    });
  }

  ngOnInit(): void {
    const chargeId = this.platnosc();
    if (chargeId) void this.awaitConfirmation(chargeId);
  }

  protected priceFor(plan: Plan): PlanPrice | undefined {
    return plan.prices.find((p) => p.interval === this.interval());
  }

  protected definition(key: string) {
    return this.plans.value()?.entitlements.find((e) => e.key === key);
  }

  protected isCurrent(plan: Plan): boolean {
    const s = this.sub.value();
    if (!s?.plan || s.plan.id !== plan.id) return false;
    return s.status === 'ACTIVE' || s.status === 'PAST_DUE' ? s.interval === this.interval() : s.status === 'TRIALING';
  }

  protected actionFor(plan: Plan): 'current' | 'checkout' | 'change' | 'blocked' {
    const s = this.sub.value()!;
    if (s.status === 'ACTIVE') {
      return s.plan?.id === plan.id && s.interval === this.interval() ? 'current' : 'change';
    }
    if (s.status === 'PAST_DUE') return s.plan?.id === plan.id && s.interval === this.interval() ? 'current' : 'blocked';
    return 'checkout';
  }

  /** Mirrors the backend rule: higher monthly price or switching to yearly billing takes effect immediately. */
  protected isUpgrade(plan: Plan, price: PlanPrice): boolean {
    const s = this.sub.value();
    if (!s?.price) return true;
    return price.monthlyAmountMinor > s.price.monthlyAmountMinor || (price.interval === 'YEAR' && s.interval === 'MONTH');
  }

  protected format = formatEntitlement;
  protected number = formatNumber;

  protected vat(net: number): number {
    return Math.round((net * (this.sub.value()?.vatRateBps ?? 2300)) / 10_000);
  }

  protected gross(net: number): string {
    return formatMoney(net + this.vat(net));
  }

  protected percent(value: number, limit: number): number {
    return Math.min(100, Math.round((value / limit) * 100));
  }

  protected openCheckout(plan: Plan, price: PlanPrice): void {
    this.coupon = '';
    this.dialogError.set(null);
    this.dialog.set({ kind: 'checkout', plan, price });
  }

  protected openChange(plan: Plan, price: PlanPrice): void {
    this.dialogError.set(null);
    this.dialog.set({ kind: 'change', plan, price, immediate: this.isUpgrade(plan, price) });
  }

  protected closeDialog(): void {
    if (!this.busy()) this.dialog.set(null);
  }

  protected async confirm(): Promise<void> {
    const d = this.dialog();
    if (!d || d.kind === 'cancel') return;
    this.busy.set(true);
    this.dialogError.set(null);
    const tenantId = this.ctx.tenantId();
    try {
      if (d.kind === 'checkout') {
        const start = await firstValueFrom(this.api.checkout(tenantId, d.plan.code, d.price.interval as BillingInterval, this.coupon.trim()));
        await this.followPayment(start.paymentUrl, start.charge);
      } else {
        const result = await firstValueFrom(this.api.change(tenantId, d.plan.code, d.price.interval as BillingInterval));
        if (result.scheduled) {
          this.dialog.set(null);
          this.toast.success(`Plan ${d.plan.name} zacznie obowiązywać od następnego okresu.`);
          this.reloadAll();
        } else if (result.payment) {
          await this.followPayment(result.payment.paymentUrl, result.payment.charge);
        }
      }
    } catch (e) {
      this.dialogError.set(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async pay(charge: Charge): Promise<void> {
    this.paying.set(charge.id);
    try {
      const start = await firstValueFrom(this.api.pay(this.ctx.tenantId(), charge.id));
      await this.followPayment(start.paymentUrl, start.charge);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.paying.set(null);
    }
  }

  protected async cancel(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.cancel(this.ctx.tenantId()));
      this.dialog.set(null);
      this.toast.success('Subskrypcja została anulowana.');
      this.reloadAll();
    } catch (e) {
      this.dialogError.set(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async resume(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.resume(this.ctx.tenantId()));
      this.toast.success('Subskrypcja będzie kontynuowana.');
      this.reloadAll();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Sends the merchant to the operator, or — for fully discounted charges — just refreshes. */
  private async followPayment(url: string | null, charge: Charge): Promise<void> {
    if (url) {
      if (!isSafeRedirectUrl(url)) {
        this.toast.error('Operator płatności zwrócił nieprawidłowy adres. Spróbuj ponownie lub skontaktuj się z obsługą.');
        return;
      }
      window.location.assign(url);
      return;
    }
    this.dialog.set(null);
    this.toast.success(charge.status === 'PAID' ? 'Gotowe — plan jest aktywny.' : 'Zapisano.');
    this.reloadAll();
  }

  /** After returning from the operator, poll until the notification has been processed (max ~30 s). */
  private async awaitConfirmation(chargeId: string): Promise<void> {
    this.confirming.set(true);
    let alive = true;
    this.destroyRef.onDestroy(() => (alive = false));
    for (let attempt = 0; attempt < 15 && alive; attempt++) {
      try {
        const s: Subscription = await firstValueFrom(this.api.subscription(this.ctx.tenantId()));
        if (!s.unpaidCharges.some((c) => c.id === chargeId)) {
          this.confirming.set(false);
          this.toast.success('Płatność zaksięgowana — dziękujemy!');
          this.reloadAll();
          break;
        }
      } catch {
        // keep trying
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (alive && this.confirming()) {
      this.confirming.set(false);
      this.toast.info('Nie otrzymaliśmy jeszcze potwierdzenia płatności. Jeśli zapłaciłeś(-aś), status zaktualizuje się automatycznie.');
    }
    if (alive) void this.router.navigate([], { queryParams: { platnosc: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private reloadAll(): void {
    this.sub.reload();
    this.charges.reload();
    this.history.reload();
    void this.ctx.refreshSubscription();
  }
}
