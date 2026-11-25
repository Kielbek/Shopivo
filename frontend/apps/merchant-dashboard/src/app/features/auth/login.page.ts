import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, AuthApi, SessionStore, safeReturnUrl } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, controlError } from '@shopivo/shared-ui';
import { catchError, firstValueFrom, of } from 'rxjs';

const OAUTH_ERRORS: Record<string, string> = {
  oauth: 'Logowanie przez Google nie powiodło się. Spróbuj ponownie.',
  'oauth-email': 'Konto Google nie ma potwierdzonego adresu e-mail.',
  'konto-zablokowane': 'Konto zostało zablokowane. Skontaktuj się z pomocą techniczną.',
};

@Component({
  selector: 'sv-login-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-[22px] font-semibold tracking-[-0.01em]">Zaloguj się</h1>
    <p class="mt-1 text-[13px] text-zinc-600">
      Nie masz konta? <a routerLink="/rejestracja" class="sv-link">Załóż sklep</a>
    </p>

    @if (blad() && oauthError(blad()!); as message) {
      <sv-alert tone="error" class="mt-6">{{ message }}</sv-alert>
    }
    @if (error(); as e) {
      <sv-alert tone="error" class="mt-6">
        {{ e.message }}
        @if (e.code === 'EMAIL_NOT_VERIFIED') {
          <button type="button" class="sv-link ml-1" (click)="resend()" [disabled]="resent()">
            {{ resent() ? 'Wysłano ponownie.' : 'Wyślij link ponownie' }}
          </button>
        }
      </sv-alert>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
      <sv-field label="Adres e-mail" for="email" [error]="err('email')">
        <input id="email" type="email" class="sv-input" formControlName="email" autocomplete="username"
          [attr.aria-invalid]="!!err('email')" />
      </sv-field>
      <sv-field label="Hasło" for="password" [error]="err('password')">
        <input id="password" type="password" class="sv-input" formControlName="password" autocomplete="current-password"
          [attr.aria-invalid]="!!err('password')" />
      </sv-field>
      <div class="flex items-center justify-between">
        <label class="flex items-center gap-2 text-[13px] text-zinc-700">
          <input type="checkbox" formControlName="rememberMe" class="size-4 rounded border-zinc-300 accent-zinc-900" />
          Zapamiętaj mnie
        </label>
        <a routerLink="/przypomnij-haslo" class="sv-link text-[13px]">Nie pamiętasz hasła?</a>
      </div>
      <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Zaloguj się</button>
    </form>

    @if (providers().includes('google')) {
      <div class="my-6 flex items-center gap-3 text-[12px] text-zinc-500">
        <span class="h-px flex-1 bg-zinc-200"></span>lub<span class="h-px flex-1 bg-zinc-200"></span>
      </div>
      <a sv-button variant="secondary" [block]="true" size="lg" href="/api/v1/auth/oauth2/authorization/google">
        Kontynuuj z Google
      </a>
    }
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
