import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, AuthApi } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, PasswordRevealComponent, controlError } from '@shopivo/shared-ui';
import { catchError, firstValueFrom, of, startWith } from 'rxjs';
import { PASSWORD_MIN_LENGTH } from '../../shared/validators';

@Component({
  selector: 'sv-register-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, FieldComponent, PasswordRevealComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (registeredEmail(); as email) {
      <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Sprawdź skrzynkę</h1>
      <p class="mt-2 text-[14px] text-ink-soft">
        Wysłaliśmy wiadomość na adres <strong>{{ email }}</strong>. Kliknij link w wiadomości, aby potwierdzić
        adres e-mail i dokończyć zakładanie konta.
      </p>
      <p class="mt-4 text-[13px] text-ink-soft">
        Nie widzisz wiadomości? Sprawdź folder spam.
        <button type="button" class="sv-link" (click)="resend(email)" [disabled]="resent()">
          {{ resent() ? 'Wysłano ponownie.' : 'Wyślij ponownie' }}
        </button>
      </p>
      <a sv-button variant="secondary" class="mt-8" routerLink="/logowanie">Przejdź do logowania</a>
    } @else {
      <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Załóż konto w Shopivo</h1>
      <p class="mt-2 text-[14px] text-ink-soft">Masz już konto? <a routerLink="/logowanie" class="sv-link font-medium">Zaloguj się</a></p>

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

      @if (error(); as e) {<sv-alert tone="error" class="mb-5">{{ e.message }}</sv-alert>}
      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <sv-field label="Imię" for="firstName" [error]="err('firstName')">
            <input id="firstName" class="sv-input sv-input-outline" formControlName="firstName" autocomplete="given-name" [attr.aria-invalid]="!!err('firstName')" />
          </sv-field>
          <sv-field label="Nazwisko" for="lastName" [error]="err('lastName')">
            <input id="lastName" class="sv-input sv-input-outline" formControlName="lastName" autocomplete="family-name" [attr.aria-invalid]="!!err('lastName')" />
          </sv-field>
        </div>
        <sv-field label="Adres e-mail" for="email" [error]="err('email')">
          <input id="email" type="email" class="sv-input sv-input-outline" formControlName="email" autocomplete="email" [attr.aria-invalid]="!!err('email')" />
        </sv-field>
        <div>
          <label class="sv-label" for="password">Hasło</label>
          <div class="relative mt-1.5">
            <input #pw id="password" type="password" class="sv-input sv-input-outline pr-12" formControlName="password" autocomplete="new-password"
              [attr.aria-invalid]="!!err('password')" aria-describedby="password-help" />
            <sv-password-reveal [input]="pw" />
          </div>
          @if (err('password'); as e) {
            <p id="password-help" class="mt-1.5 text-[12px] text-danger-ink">{{ e }}</p>
          } @else {
            <div id="password-help" class="mt-2">
              <div class="flex gap-1" aria-hidden="true">
                @for (i of [0, 1, 2, 3]; track i) {
                  <span class="h-1 flex-1 rounded-full transition-colors" [class]="i < strength().score ? strength().tone : 'bg-line-strong'"></span>
                }
              </div>
              <p class="mt-1.5 text-[12px] text-ink-muted">{{ strength().label }}</p>
            </div>
          }
        </div>
        <label class="flex items-start gap-2.5 text-[13px] leading-5 text-ink-soft">
          <input type="checkbox" formControlName="acceptTerms" class="mt-0.5 sv-checkbox" [attr.aria-invalid]="!!err('acceptTerms')" />
          <span>Akceptuję regulamin platformy i zapoznałem(-am) się z polityką prywatności.</span>
        </label>
        @if (err('acceptTerms')) {<p class="-mt-3 text-[12px] text-danger-ink">Akceptacja regulaminu jest wymagana.</p>}
        <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Załóż konto</button>
      </form>
    }
  `,
})
export class RegisterPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AuthApi);

  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly registeredEmail = signal<string | null>(null);
  protected readonly resent = signal(false);
  private readonly serverErrors = signal<Record<string, string>>({});

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(128)]],
    acceptTerms: [false, Validators.requiredTrue],
  });

  protected readonly providers = toSignal(this.api.providers().pipe(catchError(() => of<string[]>([]))), { initialValue: [] as string[] });
  private readonly password = toSignal(this.form.controls.password.valueChanges.pipe(startWith('')), { initialValue: '' });
  /** Rough guidance only — the server enforces the real rules (length, breached/common passwords). */
  protected readonly strength = computed(() => passwordStrength(this.password()));

  protected err(name: keyof typeof this.form.controls): string | null {
    return controlError(this.form.controls[name], this.serverErrors()[name]);
  }

  async submit(): Promise<void> {
    this.serverErrors.set({});
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    try {
      await firstValueFrom(this.api.register({ ...value, email: value.email.trim() }));
      this.registeredEmail.set(value.email.trim());
    } catch (e) {
      const error = ApiError.from(e);
      if (error.code === 'WEAK_PASSWORD') {
        this.serverErrors.set({ password: error.message });
      } else if (Object.keys(error.fieldErrors).length) {
        this.serverErrors.set(error.fieldErrors);
      } else {
        this.error.set(error);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  async resend(email: string): Promise<void> {
    try {
      await firstValueFrom(this.api.resendVerification(email));
      this.resent.set(true);
    } catch (e) {
      this.error.set(ApiError.from(e));
    }
  }
}

export function passwordStrength(pw: string): { score: number; label: string; tone: string } {
  if (!pw) return { score: 0, label: `Co najmniej ${PASSWORD_MIN_LENGTH} znaków. Najlepiej kilka losowych słów.`, tone: '' };
  if (pw.length < PASSWORD_MIN_LENGTH) return { score: 1, label: `Za krótkie — jeszcze ${PASSWORD_MIN_LENGTH - pw.length} zn.`, tone: 'bg-danger' };
  const variety = [/[a-ząćęłńóśźż]/, /[A-ZĄĆĘŁŃÓŚŹŻ]/, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(pw)).length;
  if (pw.length >= 16 || (pw.length >= 12 && variety >= 3)) return { score: 4, label: 'Mocne hasło.', tone: 'bg-success' };
  if (pw.length >= 12 || variety >= 3) return { score: 3, label: 'Dobre hasło.', tone: 'bg-success' };
  return { score: 2, label: 'Może być — dłuższe będzie bezpieczniejsze.', tone: 'bg-warning' };
}
