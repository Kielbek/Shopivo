import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, AuthApi, SessionStore, safeReturnUrl } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, controlError } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'sv-mfa-page',
  imports: [ReactiveFormsModule, AlertComponent, ButtonComponent, FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-[22px] font-semibold tracking-[-0.01em]">Weryfikacja dwuetapowa</h1>
    <p class="mt-1 text-[13px] text-ink-soft">
      Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej albo jeden z kodów zapasowych.
    </p>
    @if (error(); as e) {<sv-alert tone="error" class="mt-6">{{ e.message }}</sv-alert>}
    <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
      <sv-field label="Kod weryfikacyjny" for="code" [error]="codeError()">
        <input id="code" class="sv-input font-mono tracking-[0.2em]" formControlName="code" inputmode="numeric"
          autocomplete="one-time-code" maxlength="20" [attr.aria-invalid]="!!codeError()" />
      </sv-field>
      <button sv-button type="submit" [block]="true" size="lg" [loading]="submitting()">Potwierdź</button>
      <button sv-button type="button" variant="ghost" [block]="true" (click)="cancel()">Anuluj i wyloguj</button>
    </form>
  `,
})
export class MfaPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  readonly powrot = input<string>();
  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly form = this.fb.group({ code: ['', [Validators.required, Validators.minLength(6)]] });

  protected codeError(): string | null {
    return controlError(this.form.controls.code);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.loginMfa(this.form.controls.code.value.replace(/\s/g, '')));
      await this.session.refresh();
      await this.router.navigateByUrl(safeReturnUrl(this.powrot()));
    } catch (e) {
      const error = ApiError.from(e);
      this.error.set(error);
      this.form.reset();
      if (error.status === 401) {
        this.session.clear();
        await this.router.navigate(['/logowanie']);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  async cancel(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
