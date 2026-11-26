import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, AuthApi, SessionStore, StoresApi } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, PasswordRevealComponent, controlError } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { PASSWORD_MIN_LENGTH } from '../../shared/validators';

/** Link from the verification e-mail: /weryfikacja-email?token=… */
@Component({
  selector: 'sv-verify-email-page',
  imports: [RouterLink, AlertComponent, ButtonComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {<sv-loading label="Potwierdzamy adres e-mail…" />}
      @case ('done') {
        <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Adres e-mail potwierdzony</h1>
        <p class="mt-2 text-[14px] text-ink-soft">Twoje konto jest aktywne. Zaloguj się, aby utworzyć sklep.</p>
        <a sv-button class="mt-6" size="lg" routerLink="/logowanie">Zaloguj się</a>
      }
      @case ('error') {
        <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Nie udało się potwierdzić adresu</h1>
        <sv-alert tone="error" class="mt-4">{{ message() }}</sv-alert>
        <p class="mt-4 text-[13px] text-ink-soft">Zaloguj się — jeśli adres nie jest potwierdzony, wyślemy nowy link.</p>
        <a sv-button variant="secondary" class="mt-6" routerLink="/logowanie">Przejdź do logowania</a>
      }
    }
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly api = inject(AuthApi);
  readonly token = input<string>();
  protected readonly state = signal<'loading' | 'done' | 'error'>('loading');
  protected readonly message = signal('');

  async ngOnInit(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.message.set('Brak tokenu w linku.');
      this.state.set('error');
      return;
    }
    try {
      await firstValueFrom(this.api.verifyEmail(token));
      this.state.set('done');
    } catch (e) {
      this.message.set(ApiError.from(e).message);
      this.state.set('error');
    }
  }
}

@Component({
  selector: 'sv-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Nie pamiętasz hasła?</h1>
    @if (sent()) {
      <p class="mt-2 text-[14px] text-ink-soft">
        Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do ustawienia nowego hasła. Link jest ważny przez 1 godzinę.
      </p>
      <a sv-button variant="secondary" class="mt-6" routerLink="/logowanie">Wróć do logowania</a>
    } @else {
      <p class="mt-1 text-[13px] text-ink-soft">Podaj adres e-mail konta — wyślemy link do ustawienia nowego hasła.</p>
      @if (error(); as e) {<sv-alert tone="error" class="mt-6">{{ e.message }}</sv-alert>}
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <sv-field label="Adres e-mail" for="email" [error]="emailError()">
          <input id="email" type="email" class="sv-input sv-input-outline" formControlName="email" autocomplete="email"
            [attr.aria-invalid]="!!emailError()" />
        </sv-field>
        <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Wyślij link</button>
        <a routerLink="/logowanie" class="sv-link block text-center text-[13px]">Wróć do logowania</a>
      </form>
    }
  `,
})
export class ForgotPasswordPage {
  private readonly api = inject(AuthApi);
  protected readonly form = inject(NonNullableFormBuilder).group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected emailError(): string | null {
    return controlError(this.form.controls.email);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.forgotPassword(this.form.controls.email.value.trim()));
      this.sent.set(true);
    } catch (e) {
      this.error.set(ApiError.from(e));
    } finally {
      this.submitting.set(false);
    }
  }
}

/** Link from the reset e-mail: /nowe-haslo?token=… */
@Component({
  selector: 'sv-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, PasswordRevealComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Ustaw nowe hasło</h1>
    @if (done()) {
      <p class="mt-2 text-[14px] text-ink-soft">Hasło zostało zmienione, a wszystkie sesje wylogowane. Zaloguj się nowym hasłem.</p>
      <a sv-button class="mt-6" size="lg" routerLink="/logowanie">Zaloguj się</a>
    } @else if (!token()) {
      <sv-alert tone="error" class="mt-4">Link jest niepełny. Otwórz go ponownie z wiadomości e-mail.</sv-alert>
    } @else {
      @if (error(); as e) {
        <sv-alert tone="error" class="mt-6">
          {{ e.message }}
          @if (e.code === 'TOKEN_INVALID') {<a routerLink="/przypomnij-haslo" class="sv-link ml-1">Wyślij nowy link</a>}
        </sv-alert>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <div>
          <label class="sv-label" for="password">Nowe hasło</label>
          <div class="relative mt-1.5">
            <input #pw id="password" type="password" class="sv-input sv-input-outline pr-12" formControlName="password" autocomplete="new-password"
              [attr.aria-invalid]="!!err('password')" aria-describedby="password-help" />
            <sv-password-reveal [input]="pw" />
          </div>
          <p id="password-help" class="mt-1.5 text-[12px]" [class]="err('password') ? 'text-danger-ink' : 'text-ink-muted'">{{ err('password') ?? 'Co najmniej 10 znaków. Najlepiej kilka losowych słów.' }}</p>
        </div>
        <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Zapisz nowe hasło</button>
      </form>
    }
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(AuthApi);
  readonly token = input<string>();
  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  private readonly serverPasswordError = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(128)]],
  });

  protected err(name: 'password'): string | null {
    return controlError(this.form.controls[name], this.serverPasswordError());
  }

  async submit(): Promise<void> {
    this.serverPasswordError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.resetPassword(this.token()!, this.form.controls.password.value));
      this.done.set(true);
    } catch (e) {
      const error = ApiError.from(e);
      if (error.code === 'WEAK_PASSWORD') this.serverPasswordError.set(error.message);
      else this.error.set(error);
    } finally {
      this.submitting.set(false);
    }
  }
}

/** Link from the invitation e-mail: /zaproszenie?token=… (requires login; guarded). */
@Component({
  selector: 'sv-accept-invitation-page',
  imports: [RouterLink, AlertComponent, ButtonComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md px-4 py-16">
      @if (error(); as e) {
        <h1 class="text-[30px] font-semibold leading-[38px] tracking-[-0.02em] text-ink">Nie udało się przyjąć zaproszenia</h1>
        <sv-alert tone="error" class="mt-4">{{ e.message }}</sv-alert>
        @if (e.code === 'INVITATION_EMAIL_MISMATCH') {
          <p class="mt-4 text-[13px] text-ink-soft">Jesteś zalogowany jako {{ session.user()?.email }}.</p>
          <button sv-button variant="secondary" class="mt-4" (click)="switchAccount()">Zaloguj się na inne konto</button>
        } @else {
          <a sv-button variant="secondary" class="mt-6" routerLink="/">Przejdź do panelu</a>
        }
      } @else {
        <sv-loading label="Dołączamy Cię do zespołu sklepu…" />
      }
    </div>
  `,
})
export class AcceptInvitationPage implements OnInit {
  private readonly stores = inject(StoresApi);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);
  readonly token = input<string>();
  protected readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.error.set(new ApiError(400, 'TOKEN_MISSING', 'Link zaproszenia jest niepełny.'));
      return;
    }
    try {
      const { tenantId } = await firstValueFrom(this.stores.acceptInvitation(token));
      await this.router.navigate(['/sklep', tenantId]);
    } catch (e) {
      this.error.set(ApiError.from(e));
    }
  }

  async switchAccount(): Promise<void> {
    const returnUrl = `/zaproszenie?token=${encodeURIComponent(this.token() ?? '')}`;
    await this.session.logout();
    await this.router.navigate(['/logowanie'], { queryParams: { powrot: returnUrl } });
  }
}
