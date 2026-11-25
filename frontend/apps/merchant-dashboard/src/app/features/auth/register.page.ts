import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, AuthApi } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, controlError } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { PASSWORD_MIN_LENGTH } from '../../shared/validators';

@Component({
  selector: 'sv-register-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (registeredEmail(); as email) {
      <h1 class="text-[22px] font-semibold tracking-[-0.01em]">Sprawdź skrzynkę</h1>
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
      <h1 class="text-[22px] font-semibold tracking-[-0.01em]">Załóż konto</h1>
      <p class="mt-1 text-[13px] text-ink-soft">
        Masz już konto? <a routerLink="/logowanie" class="sv-link">Zaloguj się</a>
      </p>
      @if (error(); as e) {<sv-alert tone="error" class="mt-6">{{ e.message }}</sv-alert>}
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <sv-field label="Imię" for="firstName" [error]="err('firstName')">
            <input id="firstName" class="sv-input" formControlName="firstName" autocomplete="given-name"
              [attr.aria-invalid]="!!err('firstName')" />
          </sv-field>
          <sv-field label="Nazwisko" for="lastName" [error]="err('lastName')">
            <input id="lastName" class="sv-input" formControlName="lastName" autocomplete="family-name"
              [attr.aria-invalid]="!!err('lastName')" />
          </sv-field>
        </div>
        <sv-field label="Adres e-mail" for="email" [error]="err('email')">
          <input id="email" type="email" class="sv-input" formControlName="email" autocomplete="email"
            [attr.aria-invalid]="!!err('email')" />
        </sv-field>
        <sv-field label="Hasło" for="password" [error]="err('password')"
          hint="Co najmniej 10 znaków. Najlepiej kilka losowych słów.">
          <input id="password" type="password" class="sv-input" formControlName="password" autocomplete="new-password"
            [attr.aria-invalid]="!!err('password')" aria-describedby="password-hint" />
        </sv-field>
        <label class="flex items-start gap-2 text-[13px] leading-5 text-ink-soft">
          <input type="checkbox" formControlName="acceptTerms" class="mt-0.5 sv-checkbox"
            [attr.aria-invalid]="!!err('acceptTerms')" />
          <span>Akceptuję regulamin platformy i zapoznałem się z polityką prywatności.</span>
        </label>
        @if (err('acceptTerms')) {<p class="-mt-2 text-[12px] text-red-700">Akceptacja regulaminu jest wymagana.</p>}
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
