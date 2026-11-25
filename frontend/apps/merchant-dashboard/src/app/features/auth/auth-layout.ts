import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LogoComponent } from '@shopivo/shared-ui';

@Component({
  selector: 'sv-auth-layout',
  imports: [RouterOutlet, RouterLink, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col bg-zinc-50">
      <header class="px-6 py-5 sm:px-10">
        <a routerLink="/" aria-label="Shopivo — strona główna panelu"><sv-logo /></a>
      </header>
      <main class="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div class="w-full max-w-[400px]">
          <router-outlet />
        </div>
      </main>
      <footer class="px-6 pb-6 text-center text-[12px] text-zinc-500">© Shopivo</footer>
    </div>
  `,
})
export class AuthLayout {}
