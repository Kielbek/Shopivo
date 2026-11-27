import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import {
  CatalogApi, ContentApi, OnlinePaymentsApi, OrdersApi, ReturnsApi, ReviewsApi, SessionStore, StorefrontAdminApi, TenantApi,
} from '@shopivo/api-client';
import { ORDER_STATUS_LABELS, OrderStatus } from '@shopivo/shared-models';
import {
  BadgeComponent, BadgeTone, ButtonComponent, ChartSeries, DatePipe, IconName, LineChartComponent, MoneyPipe, formatMoney, icons, plural,
} from '@shopivo/shared-ui';
import { catchError, of } from 'rxjs';
import { StoreContext } from './store-context';
import { StorePublicationComponent } from '../storefront/store-publication';

interface SetupStep {
  id: string;
  icon: IconName;
  title: string;
  text: string;
  action: string;
  link: string | unknown[];
  done: boolean;
}

interface Todo { icon: IconName; label: string; count: number; link: unknown[]; tone: 'warn' | 'plain' }

type Metric = 'revenue' | 'orders' | 'aov';

const DAY = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });
const ORDER_TONE: Record<OrderStatus, BadgeTone> = {
  NEW: 'info', PROCESSING: 'warning', SHIPPED: 'violet', COMPLETED: 'success', CANCELED: 'neutral',
};

/**
 * Store home: setup guide until the store is ready, 30-day performance with one chart, the to-do list (only real
 * counts) and the latest orders and stock alerts. Widgets the role cannot read are left out.
 */
@Component({
  selector: 'sv-overview-page',
  imports: [RouterLink, LucideDynamicIcon, StorePublicationComponent, LineChartComponent, BadgeComponent, ButtonComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-[13px] font-medium text-ink-muted"><time [attr.datetime]="isoToday">{{ today }}</time></p>
        <h1 class="mt-1 text-[26px] font-semibold tracking-[-0.02em] text-ink">{{ greeting() }}{{ firstName() ? ', ' + firstName() : '' }}</h1>
      </div>
      @if (canOrders) {
        <div class="flex flex-wrap gap-2">
          <a sv-button variant="secondary" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia']"><svg [lucideIcon]="icons.orders" />Zamówienia</a>
          @if (canProducts) {<a sv-button [routerLink]="['/sklep', ctx.tenantId(), 'produkty', 'nowy']"><svg [lucideIcon]="icons.plus" />Dodaj produkt</a>}
        </div>
      }
    </header>

    <sv-store-publication />

    <!-- Setup guide -->
    @if (showGuide()) {
      <section class="sv-card mt-6 overflow-hidden" aria-labelledby="guide-h">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
          <div class="min-w-[240px] flex-1">
            <h2 id="guide-h" class="text-[15px] font-semibold text-ink">Przewodnik konfiguracji</h2>
            <p class="mt-0.5 text-[13px] text-ink-soft">Kilka kroków, po których sklep jest gotowy do sprzedaży.</p>
          </div>
          <div class="flex w-full items-center gap-3 sm:w-auto">
            <span class="text-[12.5px] font-medium tabular-nums text-ink-soft">{{ doneCount() }} z {{ steps().length }} ukończonych</span>
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas sm:w-28 sm:flex-none" role="progressbar" [attr.aria-valuenow]="doneCount()"
              aria-valuemin="0" [attr.aria-valuemax]="steps().length" aria-label="Postęp konfiguracji">
              <span class="block h-full rounded-full bg-night transition-[width]" [style.width.%]="(doneCount() / steps().length) * 100"></span>
            </span>
            <button type="button" class="rounded-full p-1.5 text-ink-muted hover:bg-hover hover:text-ink" [attr.aria-expanded]="guideOpen()"
              aria-controls="guide-steps" [attr.aria-label]="guideOpen() ? 'Zwiń przewodnik' : 'Rozwiń przewodnik'" (click)="guideOpen.set(!guideOpen())">
              <svg [lucideIcon]="icons.chevronDown" [size]="18" class="transition-transform" [class.rotate-180]="guideOpen()" /></button>
          </div>
        </div>
        @if (guideOpen()) {
          <ol id="guide-steps" class="border-t border-line p-2">
            @for (s of steps(); track s.id) {
              @let open = openStep() === s.id;
              <li class="rounded-[12px] transition-colors" [class.bg-canvas]="open">
                <button type="button" class="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left hover:bg-hover"
                  [class.hover:bg-transparent]="open" [attr.aria-expanded]="open" (click)="openStep.set(open ? null : s.id)">
                  <span class="flex size-[22px] shrink-0 items-center justify-center rounded-full"
                    [class]="s.done ? 'bg-night text-neon' : 'border-[1.5px] border-dashed border-[#B5B9B1]'">
                    @if (s.done) {<svg [lucideIcon]="icons.check" [size]="13" [strokeWidth]="3" />}
                  </span>
                  <span class="flex-1 text-[13.5px]" [class]="s.done && !open ? 'text-ink-muted' : 'font-medium text-ink'">{{ s.title }}
                    <span class="sr-only">{{ s.done ? '(ukończone)' : '' }}</span></span>
                </button>
                @if (open) {
                  <div class="flex items-start gap-5 px-3 pb-4 pl-[46px]">
                    <div class="min-w-0 flex-1">
                      <p class="max-w-xl text-[13px] leading-[1.6] text-ink-soft">{{ s.text }}</p>
                      <a sv-button size="sm" class="mt-3" [variant]="s.done ? 'secondary' : 'primary'" [routerLink]="s.link">{{ s.done ? 'Zobacz' : s.action }}</a>
                    </div>
                    <span class="hidden size-[72px] shrink-0 items-center justify-center rounded-[18px] bg-card text-ink shadow-[0_1px_0_rgba(15,18,16,0.06),0_8px_20px_-12px_rgba(15,18,16,0.25)] sm:flex" aria-hidden="true">
                      <svg [lucideIcon]="icons[s.icon]" [size]="28" [strokeWidth]="1.5" />
                    </span>
                  </div>
                }
              </li>
            }
          </ol>
        }
      </section>
    }

    <div class="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <!-- Performance -->
      @if (canOrders) {
        <section class="sv-card overflow-hidden" aria-labelledby="perf-h">
          <div class="flex items-center justify-between px-5 pt-4">
            <h2 id="perf-h" class="text-[15px] font-semibold text-ink">Wyniki</h2>
            <span class="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium text-ink-soft">Ostatnie 30 dni</span>
          </div>
          <div class="mt-3 grid grid-cols-3 border-y border-line" role="tablist" aria-label="Wskaźnik na wykresie">
            @for (m of metrics(); track m.id) {
              <button type="button" role="tab" [attr.aria-selected]="metric() === m.id" (click)="metric.set(m.id)"
                class="relative px-5 py-3.5 text-left transition-colors [&:not(:first-child)]:border-l [&:not(:first-child)]:border-line"
                [class]="metric() === m.id ? 'bg-card' : 'bg-[#FAFAF8] hover:bg-hover'">
                @if (metric() === m.id) {<span class="absolute inset-x-0 top-0 h-[3px] bg-night"></span>}
                <span class="block truncate text-[12.5px] font-medium text-ink-soft">{{ m.label }}</span>
                @if (stats.isLoading() && !stats.hasValue()) {
                  <span class="sv-shimmer mt-1.5 block h-6 w-24 rounded-[6px]"></span>
                } @else {
                  <span class="mt-0.5 block truncate text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{{ m.value }}</span>
                }
              </button>
            }
          </div>
          <div class="px-5 pb-4 pt-5">
            <sv-line-chart [labels]="labels()" [series]="series()" [height]="260" [format]="axis()" [ariaLabel]="'Wykres: ' + metricLabel() + ', ostatnie 30 dni'">
              <div class="text-center">
                <p class="text-[13px] font-medium text-ink">Brak sprzedaży w tym okresie</p>
                <p class="mt-0.5 text-[12px] text-ink-muted">Wykres pojawi się po pierwszych zamówieniach.</p>
              </div>
            </sv-line-chart>
          </div>
        </section>
      }

      <!-- To do -->
      <section class="sv-card self-start overflow-hidden" aria-labelledby="todo-h">
        <div class="px-5 pb-2 pt-4">
          <h2 id="todo-h" class="text-[15px] font-semibold text-ink">Do zrobienia</h2>
        </div>
        @if (todos().length) {
          <ul>
            @for (t of todos(); track t.label) {
              <li>
                <a [routerLink]="t.link" class="group flex items-center gap-3 border-t border-line px-5 py-3 transition-colors hover:bg-hover">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-[9px]"
                    [class]="t.tone === 'warn' ? 'bg-warning-soft text-warning-ink' : 'bg-canvas text-ink-soft'">
                    <svg [lucideIcon]="icons[t.icon]" [size]="16" /></span>
                  <span class="flex-1 text-[13.5px] text-ink">{{ t.label }}</span>
                  <span class="min-w-7 rounded-full bg-night px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums text-white">{{ t.count }}</span>
                  <svg [lucideIcon]="icons.chevronRight" [size]="16" class="text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </a>
              </li>
            }
          </ul>
        } @else if (todosLoading()) {
          <div class="space-y-2 px-5 pb-5 pt-2">@for (i of [1, 2, 3]; track i) {<span class="sv-shimmer block h-10 rounded-[10px]"></span>}</div>
        } @else {
          <div class="flex items-center gap-3 border-t border-line px-5 py-5">
            <span class="flex size-9 items-center justify-center rounded-full bg-night text-neon"><svg [lucideIcon]="icons.check" [size]="17" [strokeWidth]="2.5" /></span>
            <div><p class="text-[13.5px] font-medium text-ink">Wszystko załatwione</p>
              <p class="text-[12.5px] text-ink-muted">Nowe zamówienia, zwroty i opinie pojawią się tutaj.</p></div>
          </div>
        }
        @if (stats.value(); as st) {
          <div class="grid grid-cols-2 border-t border-line">
            <div class="px-5 py-3.5"><p class="text-[12px] text-ink-muted">Dziś</p>
              <p class="text-[15px] font-semibold tabular-nums text-ink">{{ st.revenueTodayMinor | svMoney }}</p>
              <p class="text-[12px] text-ink-muted">{{ ordersWord(st.ordersToday) }}</p></div>
            <div class="border-l border-line px-5 py-3.5"><p class="text-[12px] text-ink-muted">Produkty</p>
              <p class="text-[15px] font-semibold tabular-nums text-ink">{{ catalog.value()?.activeProducts ?? '—' }}</p>
              <p class="text-[12px] text-ink-muted">aktywnych w sklepie</p></div>
          </div>
        }
      </section>
    </div>

    @if (canOrders || canProducts) {
      <div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        @if (canOrders) {
          <section class="sv-card overflow-hidden" aria-labelledby="recent-h">
            <div class="flex items-center justify-between px-5 py-4">
              <h2 id="recent-h" class="text-[15px] font-semibold text-ink">Ostatnie zamówienia</h2>
              <a [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia']" class="text-[13px] font-medium text-ink-soft hover:text-ink">Wszystkie</a>
            </div>
            @if (recent.isLoading() && !recent.hasValue()) {
              <div class="space-y-2 px-5 pb-5">@for (i of [1, 2, 3, 4]; track i) {<span class="sv-shimmer block h-11 rounded-[10px]"></span>}</div>
            } @else if (!recent.value()?.items?.length) {
              <div class="mx-5 mb-5 sv-empty-box"><p>Tu zobaczysz zamówienia, gdy klienci zaczną kupować.</p></div>
            } @else {
              <ul>
                @for (o of recent.value()!.items; track o.id) {
                  <li>
                    <a [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia', o.id]" class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-t border-line px-5 py-3 transition-colors hover:bg-hover sm:grid-cols-[72px_minmax(0,1fr)_120px_auto_100px]">
                      <span class="text-[13px] font-semibold tabular-nums text-ink">#{{ o.number }}</span>
                      <span class="truncate text-[13px] text-ink">{{ o.customerName }}</span>
                      <span class="hidden text-[12.5px] text-ink-muted sm:block">{{ o.createdAt | svDate: 'relative' }}</span>
                      <sv-badge class="hidden sm:inline-flex" [tone]="orderTone[o.status]">{{ statusLabels[o.status] }}</sv-badge>
                      <span class="text-right text-[13px] font-medium tabular-nums text-ink">{{ o.totalMinor | svMoney }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        }
        @if (canProducts) {
          <section class="sv-card self-start overflow-hidden" aria-labelledby="stock-h">
            <div class="flex items-center justify-between px-5 py-4">
              <h2 id="stock-h" class="text-[15px] font-semibold text-ink">Niski stan</h2>
              <a [routerLink]="['/sklep', ctx.tenantId(), 'magazyn']" class="text-[13px] font-medium text-ink-soft hover:text-ink">Magazyn</a>
            </div>
            @if (!lowStock.value()?.items?.length) {
              <p class="border-t border-line px-5 py-4 text-[13px] text-ink-muted">Stany w porządku — warianty poniżej progu pojawią się tutaj.</p>
            } @else {
              <ul>
                @for (r of lowStock.value()!.items; track r.variantId) {
                  <li>
                    <a [routerLink]="['/sklep', ctx.tenantId(), 'produkty', r.productId]" class="flex items-center gap-3 border-t border-line px-5 py-3 hover:bg-hover">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[13px] font-medium text-ink">{{ r.productName }}</span>
                        <span class="block truncate text-[12px] text-ink-muted">{{ r.variantTitle || r.sku || 'Bez wariantów' }}</span>
                      </span>
                      <span class="rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                        [class]="r.available <= 0 ? 'bg-danger-soft text-danger-ink' : 'bg-warning-soft text-warning-ink'">{{ r.available <= 0 ? 'brak' : r.available + ' szt.' }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        }
      </div>
    }
  `,
})
export class OverviewPage {
  protected readonly ctx = inject(StoreContext);
  private readonly tenantApi = inject(TenantApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly contentApi = inject(ContentApi);
  private readonly themeApi = inject(StorefrontAdminApi);
  private readonly onlineApi = inject(OnlinePaymentsApi);
  private readonly returnsApi = inject(ReturnsApi);
  private readonly reviewsApi = inject(ReviewsApi);
  private readonly session = inject(SessionStore);
  protected readonly icons = icons;
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly orderTone = ORDER_TONE;

  protected readonly today = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  protected readonly isoToday = new Date().toISOString().slice(0, 10);
  protected readonly canOrders = this.ctx.can('ORDERS_READ');
  protected readonly canProducts = this.ctx.can('PRODUCTS_READ');
  protected readonly firstName = computed(() => this.session.user()?.firstName ?? '');
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 5 ? 'Dobry wieczór' : h < 18 ? 'Dzień dobry' : 'Dobry wieczór';
  });

  // --------------------------------------------------------------------------------------------- data
  private readonly t = computed(() => this.ctx.tenantId());
  protected readonly stats = rxResource({ params: () => (this.canOrders ? this.t() : undefined), stream: ({ params }) => this.ordersApi.stats(params) });
  private readonly daily = rxResource({ params: () => (this.canOrders ? this.t() : undefined), stream: ({ params }) => this.ordersApi.daily(params, 30) });
  protected readonly recent = rxResource({ params: () => (this.canOrders ? this.t() : undefined), stream: ({ params }) => this.ordersApi.orders(params, { page: 0, size: 6 }) });
  protected readonly catalog = rxResource({ params: () => (this.canProducts ? this.t() : undefined), stream: ({ params }) => this.catalogApi.stats(params) });
  protected readonly lowStock = rxResource({ params: () => (this.canProducts ? this.t() : undefined), stream: ({ params }) => this.catalogApi.inventory(params, '', true, 0, 6) });
  private readonly openReturns = rxResource({ params: () => (this.canOrders ? this.t() : undefined), stream: ({ params }) => this.returnsApi.openCount(params) });
  private readonly pendingReviews = rxResource({ params: () => (this.canProducts ? this.t() : undefined), stream: ({ params }) => this.reviewsApi.pendingCount(params) });
  private readonly settings = rxResource({ params: () => this.t(), stream: ({ params }) => this.tenantApi.settings(params) });
  // Setup checks — each one degrades to "unknown" (null) instead of failing the page.
  private readonly shipping = rxResource({ params: () => this.t(), stream: ({ params }) => this.ordersApi.shippingMethods(params).pipe(catchError(() => of(null))) });
  private readonly payments = rxResource({ params: () => this.t(), stream: ({ params }) => this.ordersApi.paymentSettings(params).pipe(catchError(() => of(null))) });
  private readonly online = rxResource({ params: () => this.t(), stream: ({ params }) => this.onlineApi.overview(params).pipe(catchError(() => of(null))) });
  private readonly legal = rxResource({ params: () => this.t(), stream: ({ params }) => this.contentApi.legal(params).pipe(catchError(() => of(null))) });
  private readonly theme = rxResource({ params: () => this.t(), stream: ({ params }) => this.themeApi.theme(params).pipe(catchError(() => of(null))) });
  private readonly members = rxResource({
    params: () => (this.ctx.can('TEAM_READ') ? this.t() : undefined),
    stream: ({ params }) => this.tenantApi.members(params).pipe(catchError(() => of(null))),
  });

  // --------------------------------------------------------------------------------------------- setup guide
  protected readonly steps = computed<SetupStep[]>(() => {
    const base = ['/sklep', this.t()];
    const s = this.settings.value();
    const pay = this.payments.value();
    const legal = this.legal.value() ?? [];
    const required = legal.filter((l) => l.requiredForPublish);
    const theme = this.theme.value();
    const steps: SetupStep[] = [
      { id: 'company', icon: 'company', title: 'Uzupełnij dane firmy', action: 'Uzupełnij dane',
        text: 'Pełna nazwa, NIP i adres są wymagane przy sprzedaży na odległość — pokazujemy je w stopce, regulaminie i e-mailach.',
        link: [...base, 'ustawienia', 'firma'], done: !!s?.legalCompanyName && !!s?.taxId && !!s?.addressLine1 },
      { id: 'product', icon: 'products', title: 'Dodaj pierwszy produkt', action: 'Dodaj produkt',
        text: 'Zdjęcia, opis, cena i warianty (np. rozmiary). Podpowiemy opcje typowe dla Twojej branży.',
        link: [...base, 'produkty', 'nowy'], done: (this.catalog.value()?.products ?? 0) > 0 },
      { id: 'shipping', icon: 'shipping', title: 'Ustaw sposoby dostawy', action: 'Dodaj dostawę',
        text: 'Kurier, paczkomat albo odbiór osobisty — z ceną i progiem darmowej dostawy.',
        link: [...base, 'wysylka'], done: (this.shipping.value() ?? []).some((m) => m.active) },
      { id: 'payments', icon: 'payments', title: 'Włącz płatności', action: 'Ustaw płatności',
        text: 'Przelew, płatność przy odbiorze albo płatności online (BLIK, karty) przez Twoje konto u operatora.',
        link: [...base, 'platnosci'], done: !!pay?.bankTransferEnabled || !!pay?.codEnabled || !!this.online.value()?.current?.enabled },
      { id: 'legal', icon: 'legal', title: 'Opublikuj regulamin i politykę prywatności', action: 'Przygotuj dokumenty',
        text: 'Wzory wypełniamy danymi Twojej firmy — przeczytaj je, uzupełnij braki i opublikuj.',
        link: [...base, 'tresci'], done: required.length > 0 && required.every((l) => l.entry?.status === 'PUBLISHED' && !l.missing.length) },
      { id: 'theme', icon: 'appearance', title: 'Wybierz wygląd sklepu', action: 'Wybierz szablon',
        text: 'Darmowe szablony do wyboru; baner, sekcje strony głównej i kolory zmienisz w edytorze z podglądem na żywo.',
        link: [...base, 'wyglad'], done: !!theme && theme.state.version >= 0 },
      { id: 'mfa', icon: 'shieldCheck', title: 'Zabezpiecz konto weryfikacją dwuetapową', action: 'Włącz 2FA',
        text: 'Kod z aplikacji przy logowaniu chroni sklep, nawet gdy ktoś pozna Twoje hasło.',
        link: '/konto', done: !!this.session.user()?.mfaEnabled },
    ];
    if (this.ctx.can('TEAM_MANAGE')) {
      steps.push({ id: 'team', icon: 'userPlus', title: 'Zaproś osoby do zespołu', action: 'Zaproś',
        text: 'Każda osoba ma własne konto i rolę — widzi tylko to, czego potrzebuje do pracy.',
        link: [...base, 'zespol'], done: (this.members.value()?.length ?? 0) > 1 });
    }
    return steps;
  });
  protected readonly doneCount = computed(() => this.steps().filter((s) => s.done).length);
  private readonly checksLoaded = computed(() => this.settings.hasValue() && !this.shipping.isLoading() && !this.legal.isLoading() && !this.theme.isLoading());
  protected readonly showGuide = computed(() => this.checksLoaded() && this.doneCount() < this.steps().length);
  protected readonly guideOpen = signal(true);
  protected readonly openStep = signal<string | null>(null);

  // --------------------------------------------------------------------------------------------- performance
  protected readonly metric = signal<Metric>('revenue');
  protected readonly metrics = computed(() => {
    const s = this.stats.value();
    const aov = s && s.orders30d ? Math.round(s.revenue30dMinor / s.orders30d) : null;
    return [
      { id: 'revenue' as Metric, label: 'Przychód', value: s ? formatMoney(s.revenue30dMinor) : '—' },
      { id: 'orders' as Metric, label: 'Zamówienia', value: s ? String(s.orders30d) : '—' },
      { id: 'aov' as Metric, label: 'Średnia wartość', value: aov === null ? '—' : formatMoney(aov) },
    ];
  });
  protected readonly metricLabel = computed(() => this.metrics().find((m) => m.id === this.metric())?.label ?? '');
  protected readonly labels = computed(() => (this.daily.value() ?? []).map((d) => DAY.format(new Date(d.day + 'T12:00:00'))));
  protected readonly series = computed<ChartSeries[]>(() => {
    const d = this.daily.value() ?? [];
    if (!d.some((x) => x.orders > 0)) return [];
    const m = this.metric();
    const values = d.map((x) => (m === 'orders' ? x.orders : m === 'revenue' ? x.revenueMinor / 100 : x.orders ? x.revenueMinor / 100 / x.orders : 0));
    return [{ name: this.metricLabel(), color: '#0F1210', values }];
  });
  protected readonly axis = computed(() => (this.metric() === 'orders'
    ? (v: number) => String(Math.round(v))
    : (v: number) => `${Math.round(v).toLocaleString('pl-PL')} zł`));

  // --------------------------------------------------------------------------------------------- to do
  protected readonly todos = computed<Todo[]>(() => {
    const base = ['/sklep', this.t()];
    const s = this.stats.value();
    const list: Todo[] = [
      { icon: 'orders', label: 'Zamówienia do realizacji', count: s ? s.newOrders + s.processing : 0, link: [...base, 'zamowienia'], tone: 'plain' },
      { icon: 'wallet', label: 'Czekają na płatność', count: s?.unpaid ?? 0, link: [...base, 'zamowienia'], tone: 'plain' },
      { icon: 'undo', label: 'Zwroty i reklamacje', count: this.openReturns.value()?.count ?? 0, link: [...base, 'zwroty'], tone: 'warn' },
      { icon: 'star', label: 'Opinie do sprawdzenia', count: this.pendingReviews.value()?.count ?? 0, link: [...base, 'opinie'], tone: 'plain' },
      { icon: 'inventory', label: 'Brak lub niski stan', count: (this.catalog.value()?.lowStockVariants ?? 0) + (this.catalog.value()?.outOfStockVariants ?? 0),
        link: [...base, 'magazyn'], tone: 'warn' },
    ];
    return list.filter((t) => t.count > 0);
  });
  protected readonly todosLoading = computed(() => (this.canOrders && this.stats.isLoading()) || (this.canProducts && this.catalog.isLoading()));

  constructor() {
    // The first unfinished step starts expanded.
    effect(() => {
      if (this.openStep() === null && this.checksLoaded()) {
        this.openStep.set(this.steps().find((s) => !s.done)?.id ?? null);
      }
    });
  }

  protected ordersWord(n: number): string {
    return plural(n, 'zamówienie', 'zamówienia', 'zamówień');
  }
}
