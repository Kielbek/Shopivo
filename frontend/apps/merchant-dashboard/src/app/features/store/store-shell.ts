import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideDynamicIcon } from '@lucide/angular';
import { SessionStore } from '@shopivo/api-client';
import { STORE_ROLE_LABELS, StorePermission } from '@shopivo/shared-models';
import {
  AlertComponent, AppShellComponent, AvatarComponent, BadgeComponent, ButtonComponent, LoadingComponent, LogoComponent,
  MenuComponent, MenuItemComponent, NavItem, NavSection, icons,
} from '@shopivo/shared-ui';
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
      { label: 'Produkty', icon: 'products', path: 'produkty', permission: 'PRODUCTS_READ' },
      { label: 'Kategorie i marki', icon: 'categories', path: 'kategorie', permission: 'PRODUCTS_READ' },
      { label: 'Magazyn', icon: 'inventory', path: 'magazyn', permission: 'PRODUCTS_READ' },
      { label: 'Klienci', icon: 'users', path: 'klienci', permission: 'CUSTOMERS_READ' },
    ],
  },
  {
    title: 'Rozwój',
    items: [
      { label: 'Analityka', icon: 'analytics', soon: true },
      { label: 'Marketing', icon: 'marketing', soon: true },
      { label: 'Rabaty', icon: 'discount', soon: true },
    ],
  },
  {
    title: 'Sklep internetowy',
    items: [
      { label: 'Wygląd sklepu', icon: 'appearance', soon: true },
      { label: 'Strony i blog', icon: 'pages', soon: true },
      { label: 'Domeny', icon: 'domains', soon: true },
    ],
  },
  {
    title: 'Konfiguracja',
    items: [
      { label: 'Płatności', icon: 'payments', path: 'platnosci', permission: 'STORE_READ' },
      { label: 'Wysyłka', icon: 'shipping', path: 'wysylka', permission: 'ORDERS_READ' },
      { label: 'Integracje', icon: 'integrations', soon: true },
      { label: 'Subskrypcja', icon: 'wallet', path: 'subskrypcja', permission: 'STORE_READ' },
    ],
  },
];

/** Pinned at the bottom of the sidebar (always visible, like Settings / Help Center in the reference). */
const NAV_BOTTOM: { title?: string; items: MerchantNavItem[] }[] = [
  {
    items: [
      { label: 'Zespół', icon: 'users', path: 'zespol', permission: 'TEAM_READ' },
      { label: 'Dziennik zdarzeń', icon: 'audit', path: 'dziennik', permission: 'AUDIT_READ' },
      { label: 'Ustawienia', icon: 'settings', path: 'ustawienia', permission: 'STORE_READ' },
      { label: 'Centrum pomocy', icon: 'help', soon: true },
    ],
  },
];

@Component({
  selector: 'sv-store-shell',
  imports: [RouterOutlet, RouterLink, LucideDynamicIcon, AppShellComponent, LoadingComponent, AlertComponent, ButtonComponent,
    MenuComponent, MenuItemComponent, AvatarComponent, BadgeComponent, LogoComponent, SubscriptionBanner],
  providers: [StoreContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.loading() && !ctx.store()) {
      <sv-loading class="min-h-dvh bg-page" label="Wczytywanie sklepu…" />
    } @else if (ctx.error(); as e) {
      <div class="flex min-h-dvh items-start justify-center bg-page px-4 pt-24">
        <div class="sv-card w-full max-w-md p-6">
          <sv-logo />
          <sv-alert tone="error" heading="Nie można otworzyć sklepu" class="mt-6">{{ e.message }}</sv-alert>
          <a sv-button variant="secondary" class="mt-5" routerLink="/sklepy">Moje sklepy</a>
        </div>
      </div>
    } @else if (ctx.store(); as store) {
      <sv-app-shell [sections]="sections()" [bottomSections]="bottomSections()" [homeLink]="base()" navLabel="Sekcje sklepu">
        <ng-container shell-header-end>
          <sv-menu label="Wybierz sklep" triggerClass="h-9 gap-2 rounded-[var(--radius-control)] border border-line px-2.5 hover:bg-hover">
            <span menu-trigger class="flex items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-[6px] bg-primary-soft text-primary-strong">
                <svg [lucideIcon]="icons.store" [size]="14" />
              </span>
              <span class="hidden max-w-[160px] truncate text-[13px] font-medium text-ink sm:inline">{{ store.name }}</span>
              <svg [lucideIcon]="icons.chevronsUpDown" [size]="14" class="text-ink-muted" />
            </span>
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

          <sv-menu label="Menu użytkownika" triggerClass="gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-hover">
            <span menu-trigger class="flex items-center gap-2">
              <sv-avatar [name]="fullName()" size="sm" />
              <span class="hidden text-[13px] font-medium text-ink md:inline">{{ fullName() }}</span>
              <svg [lucideIcon]="icons.chevronDown" [size]="14" class="hidden text-ink-muted md:block" />
            </span>
            <div class="px-2.5 pb-2 pt-1.5">
              <p class="truncate text-[13px] font-medium text-ink">{{ fullName() }}</p>
              <p class="truncate text-[12px] text-ink-muted">{{ session.user()?.email }}</p>
              <sv-badge tone="info" class="mt-1.5">{{ roleLabel() }}</sv-badge>
            </div>
            <div class="my-1 h-px bg-line"></div>
            <a sv-menu-item routerLink="/konto"><svg [lucideIcon]="icons.user" />Ustawienia konta</a>
            <button sv-menu-item type="button" (click)="logout()"><svg [lucideIcon]="icons.logout" />Wyloguj</button>
          </sv-menu>
        </ng-container>

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
  private readonly router = inject(Router);
  protected readonly icons = icons;

  readonly tenantId = input.required<string>();

  protected readonly base = computed(() => ['/sklep', this.tenantId()]);
  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url });
  protected readonly onSubscriptionPage = computed(() => this.url().split('?')[0].endsWith('/subskrypcja'));
  protected readonly sections = computed<NavSection[]>(() => this.buildNav(NAV));
  protected readonly bottomSections = computed<NavSection[]>(() => this.buildNav(NAV_BOTTOM));

  private buildNav(nav: { title?: string; items: MerchantNavItem[] }[]): NavSection[] {
    this.ctx.membership();
    return nav.map((section) => ({
      title: section.title,
      items: section.items
        .filter((i) => i.soon || !i.permission || this.ctx.can(i.permission))
        .map((i) => ({ ...i, link: i.path === undefined ? undefined : [...this.base(), ...(i.path ? [i.path] : [])] })),
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
