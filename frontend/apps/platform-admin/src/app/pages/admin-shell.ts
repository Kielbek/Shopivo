import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { SessionStore } from '@shopivo/api-client';
import {
  AppShellComponent, AvatarComponent, BadgeComponent, MenuComponent, MenuItemComponent, NavSection, icons,
} from '@shopivo/shared-ui';

/** Platform administration navigation — separate from the merchant dashboard. */
const NAV: NavSection[] = [
  { items: [{ label: 'Przegląd', icon: 'dashboard', link: '/', exact: true }] },
  {
    title: 'Platforma',
    items: [
      { label: 'Sklepy', icon: 'store', link: '/sklepy' },
      { label: 'Użytkownicy', icon: 'users', link: '/uzytkownicy' },
    ],
  },
  {
    title: 'Rozliczenia',
    items: [
      { label: 'Subskrypcje', icon: 'wallet', link: '/subskrypcje' },
      { label: 'Plany i limity', icon: 'receipt', link: '/plany' },
      { label: 'Kupony', icon: 'discount', link: '/kupony' },
      { label: 'Zużycie i rentowność', icon: 'chartPie', link: '/zuzycie' },
      { label: 'Operatorzy płatności', icon: 'payments', link: '/operatorzy-platnosci' },
    ],
  },
  {
    title: 'Ekosystem',
    items: [
      { label: 'Motywy', icon: 'appearance', soon: true },
      { label: 'Integracje', icon: 'integrations', soon: true },
    ],
  },
  {
    title: 'Operacje',
    items: [
      { label: 'Zgłoszenia', icon: 'support', soon: true },
      { label: 'Stan systemu', icon: 'chartLine', soon: true },
    ],
  },
];

const NAV_BOTTOM: NavSection[] = [
  {
    items: [
      { label: 'Dziennik zdarzeń', icon: 'audit', link: '/dziennik' },
      { label: 'Ustawienia', icon: 'settings', soon: true },
    ],
  },
];

@Component({
  selector: 'sv-admin-shell',
  imports: [RouterOutlet, LucideDynamicIcon, AppShellComponent, MenuComponent, MenuItemComponent, AvatarComponent, BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-app-shell [sections]="nav" [bottomSections]="navBottom" logoSuffix="Admin" navLabel="Administracja platformy">
      <ng-container shell-header-end>
        <sv-menu label="Menu użytkownika" triggerClass="gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-hover">
          <span menu-trigger class="flex items-center gap-2">
            <sv-avatar [name]="fullName()" size="sm" />
            <span class="hidden text-[13px] font-medium text-ink md:inline">{{ fullName() }}</span>
            <svg [lucideIcon]="icons.chevronDown" [size]="14" class="hidden text-ink-muted md:block" />
          </span>
          <div class="px-2.5 pb-2 pt-1.5">
            <p class="truncate text-[13px] font-medium text-ink">{{ fullName() }}</p>
            <p class="truncate text-[12px] text-ink-muted">{{ session.user()?.email }}</p>
            <sv-badge tone="violet" class="mt-1.5">{{ session.isPlatformAdmin() ? 'Administrator platformy' : 'Wsparcie' }}</sv-badge>
          </div>
          <div class="my-1 h-px bg-line"></div>
          <button sv-menu-item type="button" (click)="logout()"><svg [lucideIcon]="icons.logout" />Wyloguj</button>
        </sv-menu>
      </ng-container>
      <router-outlet />
    </sv-app-shell>
  `,
})
export class AdminShell {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly nav = NAV;
  protected readonly navBottom = NAV_BOTTOM;
  protected readonly fullName = computed(() => {
    const u = this.session.user();
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : '';
  });

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
