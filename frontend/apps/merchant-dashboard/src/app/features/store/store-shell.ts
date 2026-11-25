import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '@shopivo/api-client';
import { StorePermission } from '@shopivo/shared-models';
import { AlertComponent, ButtonComponent, LoadingComponent, LogoComponent } from '@shopivo/shared-ui';
import { StoreContext } from './store-context';

interface NavItem {
  label: string;
  path: string;
  permission: StorePermission;
  exact?: boolean;
}

/** Only modules that are implemented appear in the navigation (no dead links). */
const NAV: NavItem[] = [
  { label: 'Przegląd', path: '.', permission: 'STORE_READ', exact: true },
  { label: 'Ustawienia sklepu', path: 'ustawienia', permission: 'STORE_READ' },
  { label: 'Zespół', path: 'zespol', permission: 'TEAM_READ' },
  { label: 'Dziennik zdarzeń', path: 'dziennik', permission: 'AUDIT_READ' },
];

@Component({
  selector: 'sv-store-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, LoadingComponent, AlertComponent, ButtonComponent],
  providers: [StoreContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.loading() && !ctx.store()) {
      <sv-loading class="min-h-dvh" label="Wczytywanie sklepu…" />
    } @else if (ctx.error(); as e) {
      <div class="mx-auto max-w-md px-4 py-24">
        <sv-alert tone="error" heading="Nie można otworzyć sklepu">{{ e.message }}</sv-alert>
        <a sv-button variant="secondary" class="mt-6" routerLink="/sklepy">Moje sklepy</a>
      </div>
    } @else if (ctx.store(); as store) {
      <div class="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside class="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
          <div class="flex h-14 items-center justify-between px-4 lg:px-5">
            <a routerLink="/sklepy" aria-label="Moje sklepy"><sv-logo /></a>
            <button type="button" class="rounded p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden" (click)="menuOpen.set(!menuOpen())"
              [attr.aria-expanded]="menuOpen()" aria-controls="store-nav">
              <span class="sr-only">Menu</span>
              <svg viewBox="0 0 20 20" class="size-5" fill="currentColor" aria-hidden="true"><path d="M3 5h14v1.5H3zm0 4.25h14v1.5H3zM3 13.5h14V15H3z"/></svg>
            </button>
          </div>
          <div id="store-nav" class="flex-1 flex-col px-3 pb-4 lg:flex" [class.hidden]="!menuOpen()">
            <div class="mb-4 rounded-[var(--radius-ui)] border border-zinc-200 px-3 py-2.5">
              <p class="truncate text-[13px] font-semibold text-zinc-900">{{ store.name }}</p>
              <p class="truncate text-[12px] text-zinc-500">{{ store.primaryHostname }}</p>
              @if (ctx.allStores().length > 1) {
                <a routerLink="/sklepy" class="sv-link mt-1 inline-block text-[12px]">Zmień sklep</a>
              }
            </div>
            <nav aria-label="Sekcje sklepu">
              <ul class="space-y-0.5">
                @for (item of nav; track item.path) {
                  @if (ctx.can(item.permission)) {
                    <li>
                      <a [routerLink]="item.path" routerLinkActive="bg-zinc-100 text-zinc-900 font-medium"
                        [routerLinkActiveOptions]="{ exact: !!item.exact }" (click)="menuOpen.set(false)"
                        class="block rounded-[var(--radius-ui)] px-3 py-2 text-[14px] text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900">
                        {{ item.label }}
                      </a>
                    </li>
                  }
                }
              </ul>
            </nav>
            <div class="mt-auto border-t border-zinc-100 pt-3">
              <a routerLink="/konto" class="block truncate rounded px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50">
                {{ session.user()?.firstName }} {{ session.user()?.lastName }}
                <span class="block truncate text-[12px] text-zinc-500">Ustawienia konta</span>
              </a>
              <button type="button" (click)="logout()" class="block w-full rounded px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-50">
                Wyloguj
              </button>
            </div>
          </div>
        </aside>
        <main class="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
          <div class="mx-auto max-w-5xl"><router-outlet /></div>
        </main>
      </div>
    }
  `,
})
export class StoreShell {
  protected readonly ctx = inject(StoreContext);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly nav = NAV;
  protected readonly menuOpen = signal(false);

  readonly tenantId = input.required<string>();

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
