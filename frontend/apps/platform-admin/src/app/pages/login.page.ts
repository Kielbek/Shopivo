import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, AuthApi, SessionStore, safeReturnUrl } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, LogoComponent, controlError } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

const FRAME = 'flex min-h-dvh items-start justify-center bg-page px-4 pt-16 sm:pt-24';

@Component({
  selector: 'sv-admin-login-page',
  imports: [ReactiveFormsModule, AlertComponent, ButtonComponent, FieldComponent, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: FRAME },
  template: `
    <div class="sv-card w-full max-w-[400px] p-6 sm:p-8">
      <sv-logo suffix="Admin" />
      <h1 class="mt-7 text-[20px] font-semibold text-ink">Logowanie do administracji</h1>
      @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e.message }}</sv-alert>}
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <sv-field label="Adres e-mail" for="email" [error]="err('email')">
          <input id="email" type="email" class="sv-input" formControlName="email" autocomplete="username" />
        </sv-field>
        <sv-field label="Hasło" for="password" [error]="err('password')">
          <input id="password" type="password" class="sv-input" formControlName="password" autocomplete="current-password" />
        </sv-field>
        <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Zaloguj się</button>
      </form>
    </div>
  `,
})
export class AdminLoginPage {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  readonly powrot = input<string>();
  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected err(name: 'email' | 'password'): string | null {
    return controlError(this.form.controls[name]);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.submitting.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      const result = await firstValueFrom(this.api.login(email, password, false));
      await this.session.refresh();
      const target = safeReturnUrl(this.powrot());
      await this.router.navigateByUrl(result.mfaRequired ? `/logowanie/weryfikacja?powrot=${encodeURIComponent(target)}` : target);
    } catch (e) {
      this.error.set(ApiError.from(e));
      this.form.controls.password.reset();
    } finally {
      this.submitting.set(false);
    }
  }
}

@Component({
  selector: 'sv-admin-mfa-page',
  imports: [ReactiveFormsModule, AlertComponent, ButtonComponent, FieldComponent, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: FRAME },
  template: `
    <div class="sv-card w-full max-w-[400px] p-6 sm:p-8">
      <sv-logo suffix="Admin" />
      <h1 class="mt-7 text-[20px] font-semibold text-ink">Weryfikacja dwuetapowa</h1>
      @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e.message }}</sv-alert>}
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <sv-field label="Kod z aplikacji lub kod zapasowy" for="code">
          <input id="code" class="sv-input font-mono tracking-[0.2em]" formControlName="code" autocomplete="one-time-code" />
        </sv-field>
        <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Potwierdź</button>
      </form>
    </div>
  `,
})
export class AdminMfaPage {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  readonly powrot = input<string>();
  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({ code: ['', Validators.required] });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.loginMfa(this.form.controls.code.value.replace(/\s/g, '')));
      await this.session.refresh();
      await this.router.navigateByUrl(safeReturnUrl(this.powrot()));
    } catch (e) {
      this.error.set(ApiError.from(e));
      this.form.reset();
    } finally {
      this.submitting.set(false);
    }
  }
}

@Component({
  selector: 'sv-no-access-page',
  imports: [ButtonComponent, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: FRAME },
  template: `
    <div class="sv-card w-full max-w-[420px] p-6 sm:p-8">
      <sv-logo suffix="Admin" />
      <h1 class="mt-7 text-[20px] font-semibold text-ink">Brak dostępu</h1>
      <p class="mt-2 text-[14px] text-ink-soft">To konto nie ma uprawnień administratora platformy.</p>
      <p class="mt-2 text-[13px] text-ink-soft">
        Konta administratorów muszą mieć włączoną weryfikację dwuetapową. Jeśli masz rolę administratora, włącz ją
        w ustawieniach konta w panelu sklepu, a następnie zaloguj się ponownie.
      </p>
      <button sv-button variant="secondary" class="mt-6" (click)="logout()">Wyloguj się</button>
    </div>
  `,
})
export class NoAccessPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
