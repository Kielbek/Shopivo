import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { SessionStore } from '@shopivo/api-client';
import { AvatarComponent, LogoComponent, MenuComponent, MenuItemComponent, ToastOutletComponent, icons } from '@shopivo/shared-ui';

/** Header for pages outside a store context (store list, onboarding, account settings). */
@Component({
  selector: 'sv-top-bar',
  imports: [RouterLink, LucideDynamicIcon, LogoComponent, MenuComponent, MenuItemComponent, AvatarComponent, ToastOutletComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-forest text-white' },
  template: `
    <div class="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
      <a routerLink="/sklepy" aria-label="Moje sklepy"><sv-logo tone="light" /></a>
      <sv-menu label="Menu użytkownika" triggerClass="gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/10">
        <span menu-trigger class="flex items-center gap-2">
          <sv-avatar [name]="fullName()" size="sm" />
          <span class="hidden text-[13px] font-medium text-white sm:inline">{{ fullName() }}</span>
          <svg [lucideIcon]="icons.chevronDown" [size]="14" class="hidden text-forest-muted sm:block" />
        </span>
        <div class="px-2.5 pb-2 pt-1.5">
          <p class="truncate text-[13px] font-medium text-ink">{{ fullName() }}</p>
          <p class="truncate text-[12px] text-ink-muted">{{ session.user()?.email }}</p>
        </div>
        <div class="my-1 h-px bg-line"></div>
        <a sv-menu-item routerLink="/sklepy"><svg [lucideIcon]="icons.bag" />Moje sklepy</a>
        <a sv-menu-item routerLink="/konto"><svg [lucideIcon]="icons.user" />Ustawienia konta</a>
        <button sv-menu-item type="button" (click)="logout()"><svg [lucideIcon]="icons.logout" />Wyloguj</button>
      </sv-menu>
    </div>
    <sv-toast-outlet />
  `,
})
export class TopBar {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly fullName = computed(() => {
    const u = this.session.user();
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : '';
  });

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
