import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '@shopivo/api-client';
import { LogoComponent } from '@shopivo/shared-ui';

@Component({
  selector: 'sv-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a routerLink="/" class="[&_*]:!text-white" aria-label="Przegląd"><sv-logo suffix="Admin" /></a>
        <nav aria-label="Administracja" class="flex flex-1 gap-1 overflow-x-auto">
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="bg-zinc-800 text-white" [routerLinkActiveOptions]="{ exact: item.path === '/' }"
              class="whitespace-nowrap rounded px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-zinc-800 hover:text-white">{{ item.label }}</a>
          }
        </nav>
        <span class="hidden text-[12px] text-zinc-400 md:inline">{{ session.user()?.email }}</span>
        <button type="button" (click)="logout()" class="rounded px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-zinc-800 hover:text-white">Wyloguj</button>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6"><router-outlet /></main>
  `,
})
export class AdminShell {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly nav = [
    { path: '/', label: 'Przegląd' },
    { path: '/sklepy', label: 'Sklepy' },
    { path: '/uzytkownicy', label: 'Użytkownicy' },
    { path: '/dziennik', label: 'Dziennik zdarzeń' },
  ];

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
