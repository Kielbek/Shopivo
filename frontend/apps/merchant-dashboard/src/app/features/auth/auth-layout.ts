import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LogoComponent } from '@shopivo/shared-ui';

/** Centered card layout for sign-in, registration and token flows. */
@Component({
  selector: 'sv-auth-layout',
  imports: [RouterOutlet, RouterLink, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col bg-page">
      <main class="flex flex-1 flex-col items-center px-4 pb-12 pt-10 sm:pt-16">
        <a routerLink="/" aria-label="Shopivo — strona główna panelu" class="mb-8"><sv-logo /></a>
        <div class="sv-card w-full max-w-[420px] p-6 sm:p-8">
          <router-outlet />
        </div>
      </main>
      <footer class="px-6 pb-6 text-center text-[12px] text-ink-muted">© Shopivo · Platforma sklepów internetowych</footer>
    </div>
  `,
})
export class AuthLayout {}
