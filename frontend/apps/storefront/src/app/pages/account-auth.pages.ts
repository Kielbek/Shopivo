import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { CaptchaComponent } from '../ui/captcha';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CustomerSession, apiCode, apiMessage } from '../core/account';
import { takeLinkToken } from '../core/link-token';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';

function noindex(title: string, path: string): void {
  inject(Seo).set({ title, path, noindex: true }, inject(StoreState).store()?.name ?? '');
}

const SHELL = 'sf-container max-w-[440px] py-12';

@Component({
  selector: 'sf-login',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="${SHELL}">
      <h1 class="text-[28px] font-semibold tracking-tight">Zaloguj się</h1>
      <p class="mt-2 text-sf-muted">Konto pozwala śledzić zamówienia, zapisać adresy i oceniać kupione produkty.</p>
      <form class="mt-6 space-y-4" (ngSubmit)="submit()">
        <div><label class="sf-label" for="l-email">E-mail</label>
          <input id="l-email" name="email" type="email" autocomplete="email" class="sf-input" required [(ngModel)]="email" /></div>
        <div><label class="sf-label" for="l-pass">Hasło</label>
          <input id="l-pass" name="password" type="password" autocomplete="current-password" class="sf-input" required [(ngModel)]="password" /></div>
        @if (error(); as e) {<p class="text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
        <button type="submit" class="sf-btn w-full" [disabled]="busy()">Zaloguj się</button>
      </form>
      <p class="mt-5 text-[14px]"><a routerLink="/konto/reset" class="sf-link">Nie pamiętasz hasła?</a></p>
      <p class="mt-2 text-[14px] text-sf-muted">Nie masz konta? <a routerLink="/konto/rejestracja" class="sf-link">Załóż konto</a></p>
    </div>
  `,
})
export class LoginPage {
  private readonly session = inject(CustomerSession);
  private readonly router = inject(Router);
  readonly powrot = input<string>();
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    noindex('Logowanie', '/konto/logowanie');
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.session.login(this.email.trim(), this.password);
      const back = this.powrot();
      // Only paths within the store (no open redirect through ?powrot=).
      await this.router.navigateByUrl(back && /^\/(?!\/)/.test(back) ? back : '/konto');
    } catch (e) {
      this.error.set(apiMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sf-register',
  imports: [FormsModule, RouterLink, CaptchaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="${SHELL}">
      <h1 class="text-[28px] font-semibold tracking-tight">Załóż konto</h1>
      @if (done()) {
        <div class="sf-panel mt-6 p-5" role="status">
          <p class="font-medium">Sprawdź skrzynkę {{ email }}</p>
          <p class="mt-2 text-sf-muted">Wysłaliśmy link do potwierdzenia konta. Po kliknięciu podasz hasło ustawione przed chwilą.</p>
        </div>
      } @else {
        <form class="mt-6 space-y-4" (ngSubmit)="submit()">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="sf-label" for="r-first">Imię</label><input id="r-first" name="first" autocomplete="given-name" class="sf-input" [(ngModel)]="firstName" /></div>
            <div><label class="sf-label" for="r-last">Nazwisko</label><input id="r-last" name="last" autocomplete="family-name" class="sf-input" [(ngModel)]="lastName" /></div>
          </div>
          <div><label class="sf-label" for="r-email">E-mail</label><input id="r-email" name="email" type="email" autocomplete="email" class="sf-input" [(ngModel)]="email" /></div>
          <div><label class="sf-label" for="r-pass">Hasło</label>
            <input id="r-pass" name="password" type="password" autocomplete="new-password" class="sf-input" [(ngModel)]="password" aria-describedby="r-pass-hint" />
            <p id="r-pass-hint" class="mt-1 text-[12px] text-sf-muted">Co najmniej 10 znaków. Najlepiej kilka słów.</p></div>
          <label class="flex items-start gap-2.5 text-[13px]"><input type="checkbox" class="sf-check mt-0.5" name="terms" [(ngModel)]="terms" />
            <span>Akceptuję @if (termsPath(); as p) {<a class="sf-link" [href]="p" target="_blank" rel="noopener">regulamin sklepu</a>} @else {regulamin sklepu}.</span></label>
          @if (siteKey(); as key) {<sf-captcha #captcha [siteKey]="key" (token)="captchaToken = $event" />}
          @if (error(); as e) {<p class="text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
          <button type="submit" class="sf-btn w-full" [disabled]="busy()">Załóż konto</button>
        </form>
        <p class="mt-5 text-[14px] text-sf-muted">Masz już konto? <a routerLink="/konto/logowanie" class="sf-link">Zaloguj się</a></p>
      }
    </div>
  `,
})
export class RegisterPage {
  private readonly session = inject(CustomerSession);
  private readonly store = inject(StoreState);
  protected firstName = '';
  protected lastName = '';
  protected email = '';
  protected password = '';
  protected terms = false;
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly termsPath = computed(() => this.store.store()?.footerLinks.find((l) => l.systemKey === 'TERMS')?.path ?? null);
  protected readonly siteKey = computed(() => this.store.store()?.captchaSiteKey ?? null);
  protected captchaToken: string | null = null;
  private readonly captcha = viewChild<CaptchaComponent>('captcha');

  constructor() {
    noindex('Załóż konto', '/konto/rejestracja');
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (!this.terms) {
      this.error.set('Zaakceptuj regulamin sklepu.');
      return;
    }
    if (this.siteKey() && !this.captchaToken) {
      this.error.set('Potwierdź, że nie jesteś robotem.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.session.register({ email: this.email.trim(), password: this.password, firstName: this.firstName.trim(),
        lastName: this.lastName.trim(), termsAccepted: this.terms }, this.captchaToken));
      this.done.set(true);
    } catch (e) {
      this.error.set(apiMessage(e));
      this.captcha()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sf-verify',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="${SHELL}">
      <h1 class="text-[28px] font-semibold tracking-tight">Potwierdź konto</h1>
      @if (!token) {
        <p class="mt-4">Link jest niepełny. Otwórz go ponownie z wiadomości e-mail.</p>
      } @else {
        <p class="mt-2 text-sf-muted">Dla bezpieczeństwa wpisz hasło ustawione przy zakładaniu konta.</p>
        <form class="mt-6 space-y-4" (ngSubmit)="submit()">
          <div><label class="sf-label" for="v-pass">Hasło</label>
            <input id="v-pass" name="password" type="password" autocomplete="current-password" class="sf-input" [(ngModel)]="password" /></div>
          @if (error(); as e) {<p class="text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
          <button type="submit" class="sf-btn w-full" [disabled]="busy()">Potwierdź i zaloguj</button>
        </form>
        <p class="mt-5 text-[13px] text-sf-muted">Nie zakładałeś(-aś) konta? Zamknij tę stronę — bez hasła konto nie zostanie aktywowane.</p>
      }
      <p class="mt-3 text-[14px]"><a routerLink="/konto/rejestracja" class="sf-link">Wyślij nowy link (zarejestruj się ponownie)</a></p>
    </div>
  `,
})
export class VerifyPage {
  private readonly session = inject(CustomerSession);
  private readonly router = inject(Router);
  protected readonly token = takeLinkToken();
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    noindex('Potwierdź konto', '/konto/potwierdz');
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.session.verify(this.token!, this.password);
      await this.router.navigateByUrl('/konto');
    } catch (e) {
      this.error.set(apiMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sf-reset-request',
  imports: [FormsModule, RouterLink, CaptchaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="${SHELL}">
      <h1 class="text-[28px] font-semibold tracking-tight">Nie pamiętasz hasła?</h1>
      @if (sent()) {
        <p class="sf-panel mt-6 p-5" role="status">Jeśli konto z adresem {{ email }} istnieje, wysłaliśmy na nie link do ustawienia nowego hasła (ważny 1 godzinę).</p>
      } @else {
        <form class="mt-6 space-y-4" (ngSubmit)="submit()">
          <div><label class="sf-label" for="rr-email">E-mail</label><input id="rr-email" name="email" type="email" autocomplete="email" class="sf-input" [(ngModel)]="email" /></div>
          @if (siteKey(); as key) {<sf-captcha #captcha [siteKey]="key" (token)="captchaToken = $event" />}
          @if (error(); as e) {<p class="text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
          <button type="submit" class="sf-btn w-full" [disabled]="busy()">Wyślij link</button>
        </form>
      }
      <p class="mt-5 text-[14px]"><a routerLink="/konto/logowanie" class="sf-link">Wróć do logowania</a></p>
    </div>
  `,
})
export class ResetRequestPage {
  private readonly session = inject(CustomerSession);
  private readonly store = inject(StoreState);
  protected readonly siteKey = computed(() => this.store.store()?.captchaSiteKey ?? null);
  protected captchaToken: string | null = null;
  private readonly captcha = viewChild<CaptchaComponent>('captcha');
  protected email = '';
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    noindex('Nowe hasło', '/konto/reset');
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.session.requestReset(this.email.trim(), this.captchaToken));
      this.sent.set(true);
    } catch (e) {
      this.error.set(apiMessage(e));
      this.captcha()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sf-reset',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="${SHELL}">
      <h1 class="text-[28px] font-semibold tracking-tight">Ustaw nowe hasło</h1>
      @if (done()) {
        <p class="sf-panel mt-6 p-5" role="status">Hasło zostało zmienione. Wylogowaliśmy Cię ze wszystkich urządzeń.</p>
        <a routerLink="/konto/logowanie" class="sf-btn mt-6">Zaloguj się</a>
      } @else if (!token) {
        <p class="mt-4">Link jest niepełny. <a routerLink="/konto/reset" class="sf-link">Poproś o nowy</a>.</p>
      } @else {
        <form class="mt-6 space-y-4" (ngSubmit)="submit()">
          <div><label class="sf-label" for="np-pass">Nowe hasło</label>
            <input id="np-pass" name="password" type="password" autocomplete="new-password" class="sf-input" [(ngModel)]="password" /></div>
          @if (error(); as e) {<p class="text-[14px] text-sf-danger" role="alert">{{ e }} @if (expired()) {<a routerLink="/konto/reset" class="sf-link">Poproś o nowy link</a>}</p>}
          <button type="submit" class="sf-btn w-full" [disabled]="busy()">Zapisz hasło</button>
        </form>
      }
    </div>
  `,
})
export class ResetPage {
  private readonly session = inject(CustomerSession);
  protected readonly token = takeLinkToken();
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expired = signal(false);

  constructor() {
    noindex('Ustaw nowe hasło', '/konto/nowe-haslo');
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.session.confirmReset(this.token!, this.password));
      this.session.signedOut();
      this.done.set(true);
    } catch (e) {
      this.error.set(apiMessage(e));
      this.expired.set(apiCode(e) === 'INVALID_TOKEN');
    } finally {
      this.busy.set(false);
    }
  }
}
