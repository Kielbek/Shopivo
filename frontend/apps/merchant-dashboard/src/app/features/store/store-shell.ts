import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideDynamicIcon } from '@lucide/angular';
import { SessionStore, StoresApi } from '@shopivo/api-client';
import { STORE_ROLE_LABELS, StorePermission } from '@shopivo/shared-models';
import {
  AlertComponent, AppShellComponent, AvatarComponent, BadgeComponent, ButtonComponent, LoadingComponent, LogoComponent,
  MenuComponent, MenuItemComponent, NavIconComponent, NavItem, NavSection, icons,
} from '@shopivo/shared-ui';
import { BackIconComponent } from '@shopivo/shared-ui';
import { SubscriptionBanner } from './subscription-banner';
import { StoreContext } from './store-context';

type MerchantNavItem = NavItem & { path?: string; permission?: StorePermission };

/**
 * Merchant navigation. Items without `path` are planned modules (roadmap phases 2–8): they are shown
 * so the information architecture is complete, but are not links.
 */
const NAV: { title?: string; items: MerchantNavItem[] }[] = [
  { items: [{ label: 'Przegląd', icon: 'dashboard', path: '', exact: true, permission: 'STORE_READ' }] },
  {
    title: 'Sprzedaż',
    items: [
      { label: 'Zamówienia', icon: 'orders', path: 'zamowienia', permission: 'ORDERS_READ' },
      { label: 'Zwroty i reklamacje', icon: 'undo', path: 'zwroty', permission: 'ORDERS_READ' },
      { label: 'Produkty', icon: 'products', path: 'produkty', permission: 'PRODUCTS_READ' },
      { label: 'Kategorie i marki', icon: 'categories', path: 'kategorie', permission: 'PRODUCTS_READ' },
      { label: 'Magazyn', icon: 'inventory', path: 'magazyn', permission: 'PRODUCTS_READ' },
      { label: 'Wysyłka i dostawa', icon: 'shipping', path: 'wysylka', permission: 'ORDERS_READ' },
      { label: 'Klienci', icon: 'users', path: 'klienci', permission: 'CUSTOMERS_READ' },
      { label: 'Opinie', icon: 'star', path: 'opinie', permission: 'PRODUCTS_READ' },
    ],
  },
  {
    title: 'Rozwój',
    items: [
      { label: 'Analityka', icon: 'analytics', soon: true },
      { label: 'Newsletter', icon: 'mail', path: 'newsletter', permission: 'CUSTOMERS_READ' },
      { label: 'Marketing', icon: 'marketing', soon: true },
      { label: 'Rabaty', icon: 'discount', soon: true },
    ],
  },
  {
    title: 'Sklep internetowy',
    items: [
      { label: 'Wygląd sklepu', icon: 'appearance', path: 'wyglad', permission: 'STORE_READ' },
      { label: 'Strony i blog', icon: 'pages', path: 'tresci', permission: 'STORE_READ' },
      { label: 'Domeny', icon: 'domains', soon: true },
    ],
  },
];

/** Settings area: opens next to the collapsed navigation (desktop) or as a strip above the page (phones). */
export const SETTINGS_NAV: MerchantNavItem[] = [
  { label: 'Ogólne', icon: 'store', path: 'ustawienia', exact: true, permission: 'STORE_READ' },
  { label: 'Dane firmy', icon: 'company', path: 'ustawienia/firma', permission: 'STORE_READ' },
  { label: 'Płatności', icon: 'payments', path: 'platnosci', permission: 'STORE_READ' },
  { label: 'Integracje', icon: 'integrations', path: 'integracje', permission: 'STORE_READ' },
  { label: 'Zespół', icon: 'users', path: 'zespol', permission: 'TEAM_READ' },
  { label: 'Plan i rozliczenia', icon: 'wallet', path: 'subskrypcja', permission: 'STORE_READ' },
  { label: 'Dziennik zdarzeń', icon: 'audit', path: 'dziennik', permission: 'AUDIT_READ' },
  { label: 'Domeny', icon: 'domains', soon: true },
];
/** Planned modules are listed only in the settings navigation; the main navigation shows what works today. */
const SETTINGS_NAV_GROUP = [{ items: SETTINGS_NAV }];
const SETTINGS_PATHS = SETTINGS_NAV.filter((i) => i.path).map((i) => i.path!);

/** Pinned at the bottom of the sidebar (always visible, like Settings / Help Center in the reference). */
const NAV_BOTTOM: { title?: string; items: MerchantNavItem[] }[] = [
  {
    items: [
      { label: 'Ustawienia', icon: 'settings', path: 'ustawienia', permission: 'STORE_READ' },
      { label: 'Centrum pomocy', icon: 'help', soon: true },
    ],
  },
];

@Component({
  selector: 'sv-store-shell',
  imports: [BackIconComponent, NavIconComponent, RouterOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon, AppShellComponent, LoadingComponent, AlertComponent, ButtonComponent,
    MenuComponent, MenuItemComponent, AvatarComponent, LogoComponent, SubscriptionBanner],
  providers: [StoreContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.loading() && !ctx.store()) {
      <sv-loading variant="page" label="Wczytywanie sklepu…" />
    } @else if (ctx.error(); as e) {
      <div class="flex min-h-dvh items-start justify-center bg-page px-4 pt-24">
        <div class="sv-card w-full max-w-md p-6">
          <sv-logo />
          <sv-alert tone="error" heading="Nie można otworzyć sklepu" class="mt-6">{{ e.message }}</sv-alert>
          <a sv-button variant="secondary" class="mt-5" routerLink="/sklepy">Moje sklepy</a>
        </div>
      </div>
    } @else if (ctx.store(); as store) {
      <sv-app-shell [sections]="sections()" [bottomSections]="bottomSections()" [homeLink]="base()" navLabel="Sekcje sklepu"
        [rail]="inSettings()" [hasSubnav]="inSettings()" subnavLabel="Ustawienia" [narrow]="inSettings()">
        @if (inSettings()) {
          <div shell-subnav>
            <div class="flex h-16 items-center gap-2 px-3">
              <a [routerLink]="base()" class="group flex items-center rounded-[8px] px-2 py-1.5 text-[14px] font-semibold text-nav-strong hover:bg-nav-hover" aria-label="Wróć do panelu sklepu">
                <sv-back-icon icon="settings" label="Ustawienia" hoverLabel="Wróć" /></a>
            </div>
            <!-- Store switcher (with the store's status). -->
            <div class="mx-3 mb-4">
          <sv-menu class="block w-full" align="start" label="Wybierz sklep"
            triggerClass="w-full gap-2.5 rounded-[12px] border border-nav-line bg-nav-field px-2.5 py-2 text-left hover:bg-nav-hover">
            <span menu-trigger class="flex w-full min-w-0 items-center gap-2.5">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-neon text-[12px] font-bold text-on-neon">{{ initials() }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium text-nav-strong">{{ store.name }}</span>
                <span class="flex items-center gap-1.5 truncate text-[11.5px] text-nav-muted" [attr.title]="store.status === 'PUBLISHED' ? null : 'Sklep jest niewidoczny dla klientów do czasu publikacji'">
                  <span class="size-1.5 rounded-full" [class]="store.status === 'PUBLISHED' ? 'bg-success' : 'bg-warning'"></span>
                  {{ store.status === 'PUBLISHED' ? 'Sklep otwarty' : 'Szkic' }}</span>
              </span>
              <svg [lucideIcon]="icons.chevronsUpDown" [size]="15" class="shrink-0 text-nav-muted" />
            </span>
            @if (store.status === 'PUBLISHED' && storeUrl()) {
              <a sv-menu-item [href]="storeUrl()" target="_blank" rel="noopener"><svg [lucideIcon]="icons.external" />Otwórz sklep
                <span class="ml-auto truncate text-[11px] text-ink-muted">{{ store.primaryHostname }}</span></a>
              <div class="my-1 h-px bg-line"></div>
            }
            <p class="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Twoje sklepy</p>
            @for (s of ctx.allStores(); track s.tenantId) {
              @if (s.tenantStatus === 'ACTIVE') {
                <a sv-menu-item [routerLink]="['/sklep', s.tenantId]" [active]="s.tenantId === store.tenantId">
                  <svg [lucideIcon]="icons.store" />
                  <span class="min-w-0 flex-1 truncate">{{ s.name }}</span>
                  @if (s.tenantId === store.tenantId) {<svg [lucideIcon]="icons.check" class="!text-primary-strong" />}
                </a>
              }
            }
            <div class="my-1 h-px bg-line"></div>
            <a sv-menu-item routerLink="/nowy-sklep"><svg [lucideIcon]="icons.plus" />Nowy sklep</a>
            <a sv-menu-item routerLink="/sklepy"><svg [lucideIcon]="icons.bag" />Wszystkie sklepy</a>
          </sv-menu>
        </div>
            <ul class="space-y-0.5 px-3">
              @for (it of settingsNav(); track it.label) {
                <li>
                  @if (it.link) {
                    <a [routerLink]="it.link" routerLinkActive #rla="routerLinkActive" [routerLinkActiveOptions]="{ exact: !!it.exact }"
                      [attr.aria-current]="rla.isActive ? 'page' : null"
                      class="flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors"
                      [class]="rla.isActive ? 'bg-nav-active font-medium text-nav-active-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)]' : 'text-nav-text hover:bg-nav-hover hover:text-nav-strong'">
                      <sv-nav-icon [name]="it.icon" [active]="rla.isActive" [size]="18" [class]="rla.isActive ? 'text-nav-active-text' : 'text-nav-muted'" />{{ it.label }}</a>
                  } @else {
                    <span class="flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] text-nav-muted/60" aria-disabled="true">
                      <sv-nav-icon [name]="it.icon" [size]="18" class="text-nav-muted/50" />
                      <span class="flex-1">{{ it.label }}<span class="sr-only"> (wkrótce)</span></span>
                      <span class="rounded-full border border-nav-line px-1.5 text-[10px] text-nav-muted" aria-hidden="true">wkrótce</span></span>
                  }
                </li>
              }
            </ul>
          </div>
        }
        @if (inSettings()) {
          <!-- Account (opens upwards). -->
          <div shell-subnav-bottom class="border-t border-nav-line px-3 py-3">
          <sv-menu class="block w-full" align="start" side="top" label="Menu użytkownika"
            triggerClass="w-full gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-nav-hover">
            <span menu-trigger class="flex w-full min-w-0 items-center gap-2.5">
              <sv-avatar [name]="fullName()" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium text-nav-strong">{{ fullName() }}</span>
                <span class="block truncate text-[11.5px] text-nav-muted">{{ roleLabel() }}</span>
              </span>
              <span class="shrink-0 text-nav-muted"><svg [lucideIcon]="icons.chevronsUpDown" [size]="15" /></span>
            </span>
            <div class="px-2.5 pb-2 pt-1.5">
              <p class="truncate text-[13px] font-medium text-ink">{{ fullName() }}</p>
              <p class="truncate text-[12px] text-ink-muted">{{ session.user()?.email }}</p>
            </div>
            <div class="my-1 h-px bg-line"></div>
            <a sv-menu-item routerLink="/konto"><svg [lucideIcon]="icons.user" />Ustawienia konta</a>
            <button sv-menu-item type="button" (click)="logout()"><svg [lucideIcon]="icons.logout" />Wyloguj</button>
          </sv-menu>
        </div>
        }


        @if (inSettings()) {
          <!-- Phones: the settings sections as a scrollable strip. -->
          <nav class="-mx-4 mb-5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden" aria-label="Ustawienia">
            <ul class="flex gap-2">
              @for (it of settingsNav(); track it.label) {
                @if (it.link) {
                  <li><a [routerLink]="it.link" routerLinkActive #rlm="routerLinkActive" [routerLinkActiveOptions]="{ exact: !!it.exact }"
                    [attr.aria-current]="rlm.isActive ? 'page' : null"
                    class="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium"
                    [class]="rlm.isActive ? 'border-night bg-night text-white' : 'border-line-strong bg-card text-ink-soft'">{{ it.label }}</a></li>
                }
              }
              <li><a routerLink="/sklepy" class="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-card px-3.5 text-[13px] font-medium text-ink-soft">Moje sklepy</a></li>
              <li><a routerLink="/konto" class="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-card px-3.5 text-[13px] font-medium text-ink-soft">Konto</a></li>
              <li><button type="button" class="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-card px-3.5 text-[13px] font-medium text-ink-soft" (click)="logout()">Wyloguj</button></li>
            </ul>
          </nav>
        }
        @if (!onSubscriptionPage()) {
          <sv-subscription-banner [subscription]="ctx.subscription()" [link]="[...base(), 'subskrypcja']" />
        }
        <router-outlet />
      </sv-app-shell>
    }
  `,
})
export class StoreShell {
  protected readonly ctx = inject(StoreContext);
  protected readonly session = inject(SessionStore);
  private readonly storesApi = inject(StoresApi);
  private readonly router = inject(Router);
  protected readonly icons = icons;

  readonly tenantId = input.required<string>();

  protected readonly base = computed(() => ['/sklep', this.tenantId()]);
  private readonly platformConfig = rxResource({ stream: () => this.storesApi.config() });
  protected readonly storeUrl = computed(() => {
    const host = this.ctx.store()?.primaryHostname;
    return host ? (this.platformConfig.value()?.storefrontUrlTemplate ?? 'https://{host}').replace('{host}', host) : null;
  });
  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url });
  protected readonly onSubscriptionPage = computed(() => this.url().split('?')[0].endsWith('/subskrypcja'));
  private readonly path = computed(() => this.url().split('?')[0].split('#')[0].replace(/^\/sklep\/[^/]+\/?/, ''));
  /** Settings area: any of its sections (and sub-pages, e.g. ustawienia/firma). */
  protected readonly inSettings = computed(() => SETTINGS_PATHS.some((p) => this.path() === p || this.path().startsWith(p + '/')));
  protected readonly sections = computed<NavSection[]>(() => this.buildNav(NAV));
  protected readonly bottomSections = computed<NavSection[]>(() =>
    this.buildNav(NAV_BOTTOM).map((sec) => ({ ...sec, items: sec.items.map((i) => (i.label === 'Ustawienia' ? { ...i, active: this.inSettings() } : i)) })));
  protected readonly settingsNav = computed<NavItem[]>(() => this.buildNav(SETTINGS_NAV_GROUP)[0]?.items ?? []);
  protected readonly initials = computed(() => (this.ctx.store()?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase());

  private buildNav(nav: { title?: string; items: MerchantNavItem[] }[]): NavSection[] {
    this.ctx.membership();
    return nav.map((section) => ({
      title: section.title,
      items: section.items
        .filter((i) => (i.soon ? nav === SETTINGS_NAV_GROUP : !i.permission || this.ctx.can(i.permission)))
        .map((i) => ({ ...i, link: i.path === undefined ? undefined : [...this.base(), ...(i.path ? i.path.split('/') : [])] })),
    })).filter((s) => s.items.length > 0);
  }
  protected readonly fullName = computed(() => {
    const u = this.session.user();
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : '';
  });
  protected readonly roleLabel = computed(() => {
    const role = this.ctx.membership()?.role;
    return role ? STORE_ROLE_LABELS[role] : '';
  });

  constructor() {
    effect(() => {
      void this.ctx.load(this.tenantId());
    });
  }

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
