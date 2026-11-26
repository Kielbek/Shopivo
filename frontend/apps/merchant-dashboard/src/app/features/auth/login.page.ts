import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, AuthApi, SessionStore, safeReturnUrl } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, PasswordRevealComponent, controlError } from '@shopivo/shared-ui';
import { catchError, firstValueFrom, of } from 'rxjs';

const OAUTH_ERRORS: Record<string, string> = {
  oauth: 'Logowanie przez Google nie powiodło się. Spróbuj ponownie.',
  'oauth-email': 'Konto Google nie ma potwierdzonego adresu e-mail.',
  'konto-zablokowane': 'Konto zostało zablokowane. Skontaktuj się z pomocą techniczną.',
};

@Component({
  selector: 'sv-login-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, FieldComponent, PasswordRevealComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Zaloguj się do Shopivo</h1>
    <p class="mt-2 text-[14px] text-ink-soft">Nie masz konta? <a routerLink="/rejestracja" class="sv-link font-medium">Załóż sklep za darmo</a></p>

    @if (providers().includes('google')) {
      <a class="mt-8 flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-line-strong bg-card text-[14px] font-medium text-ink
        transition-colors hover:border-[#C9CFD9] hover:bg-[#F7F8FA]" href="/api/v1/auth/oauth2/authorization/google">
        <svg viewBox="0 0 24 24" class="size-[18px]" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        Kontynuuj z Google
      </a>
      <div class="my-6 flex items-center gap-3 text-[12px] text-ink-muted"><span class="h-px flex-1 bg-line-strong"></span>lub e-mailem<span class="h-px flex-1 bg-line-strong"></span></div>
    } @else {
      <div class="mt-8"></div>
    }

    @if (blad() && oauthError(blad()!); as message) {<sv-alert tone="error" class="mb-5">{{ message }}</sv-alert>}
    @if (error(); as e) {
      <sv-alert tone="error" class="mb-5">
        {{ e.message }}
        @if (e.code === 'EMAIL_NOT_VERIFIED') {
          <button type="button" class="sv-link ml-1" (click)="resend()" [disabled]="resent()">{{ resent() ? 'Wysłano ponownie.' : 'Wyślij link ponownie' }}</button>
        }
      </sv-alert>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5" novalidate>
      <sv-field label="Adres e-mail" for="email" [error]="err('email')">
        <input id="email" type="email" class="sv-input sv-input-outline" formControlName="email" autocomplete="username" [attr.aria-invalid]="!!err('email')" />
      </sv-field>
      <div>
        <div class="flex items-center justify-between">
          <label class="sv-label" for="password">Hasło</label>
          <a routerLink="/przypomnij-haslo" class="sv-link text-[13px]">Nie pamiętasz hasła?</a>
        </div>
        <div class="relative mt-1.5">
          <input #pw id="password" type="password" class="sv-input sv-input-outline pr-12" formControlName="password" autocomplete="current-password"
            [attr.aria-invalid]="!!err('password')" [attr.aria-describedby]="err('password') ? 'password-error' : null" />
          <sv-password-reveal [input]="pw" />
        </div>
        @if (err('password'); as e) {<p id="password-error" class="mt-1.5 text-[12px] text-danger-ink">{{ e }}</p>}
      </div>
      <label class="flex items-center gap-2.5 text-[13px] text-ink-soft">
        <input type="checkbox" formControlName="rememberMe" class="sv-checkbox" />Nie wylogowuj mnie na tym urządzeniu
      </label>
      <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Zaloguj się</button>
    </form>
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  readonly powrot = input<string>();
  readonly blad = input<string>();

  protected readonly providers = toSignal(this.api.providers().pipe(catchError(() => of<string[]>([]))), {
    initialValue: [] as string[],
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly resent = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: [false],
  });

  protected err(name: 'email' | 'password'): string | null {
    return controlError(this.form.controls[name]);
  }

  protected oauthError(code: string): string | null {
    return OAUTH_ERRORS[code] ?? null;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const { email, password, rememberMe } = this.form.getRawValue();
    try {
      const result = await firstValueFrom(this.api.login(email, password, rememberMe));
      await this.session.refresh();
      const target = safeReturnUrl(this.powrot());
      if (result.mfaRequired) {
        await this.router.navigate(['/logowanie/weryfikacja'], { queryParams: { powrot: target } });
      } else {
        await this.router.navigateByUrl(target);
      }
    } catch (e) {
      this.error.set(ApiError.from(e));
      this.form.controls.password.reset();
    } finally {
      this.submitting.set(false);
    }
  }

  async resend(): Promise<void> {
    try {
      await firstValueFrom(this.api.resendVerification(this.form.controls.email.value));
      this.resent.set(true);
    } catch (e) {
      this.error.set(ApiError.from(e));
    }
  }
}
