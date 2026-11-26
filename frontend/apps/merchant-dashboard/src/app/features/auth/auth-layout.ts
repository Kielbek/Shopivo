import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LogoComponent } from '@shopivo/shared-ui';

/** Sign-in, registration and token flows: a quiet full page with one narrow column — no card. */
@Component({
  selector: 'sv-auth-layout',
  imports: [RouterOutlet, RouterLink, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col bg-[#FAFBFC]">
      <header class="flex h-16 items-center px-5 sm:px-8">
        <a routerLink="/" aria-label="Shopivo — strona główna panelu"><sv-logo /></a>
      </header>
      <main class="flex flex-1 justify-center px-5 pb-16 pt-6 sm:pt-[9vh]">
        <div class="w-full max-w-[440px]"><router-outlet /></div>
      </main>
      <footer class="flex flex-wrap justify-center gap-x-5 gap-y-1 px-6 pb-6 text-[12px] text-ink-muted">
        <span>© Shopivo</span><span>Platforma sklepów internetowych</span>
      </footer>
    </div>
  `,
})
export class AuthLayout {}
