import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '@shopivo/api-client';
import { ButtonComponent, LogoComponent } from '@shopivo/shared-ui';

@Component({
  selector: 'sv-top-bar',
  imports: [RouterLink, LogoComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-zinc-200 bg-white' },
  template: `
    <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
      <a routerLink="/sklepy" aria-label="Moje sklepy"><sv-logo /></a>
      <div class="flex items-center gap-1">
        <a routerLink="/konto" class="rounded px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-100">{{ session.user()?.email }}</a>
        <button sv-button variant="ghost" size="sm" (click)="logout()">Wyloguj</button>
      </div>
    </div>
  `,
})
export class TopBar {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
