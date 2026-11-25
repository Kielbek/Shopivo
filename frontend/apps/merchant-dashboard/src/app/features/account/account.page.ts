import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountApi, ApiError, SessionStore } from '@shopivo/api-client';
import { TotpSetup } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DatePipe, FieldComponent, LoadingComponent,
  PageHeaderComponent, SectionComponent, ToastService, controlError, describeUserAgent, icons,
} from '@shopivo/shared-ui';
import { LucideDynamicIcon } from '@lucide/angular';
import { TopBar } from '../onboarding/top-bar';
import { toDataURL } from 'qrcode';
import { firstValueFrom } from 'rxjs';
import { PASSWORD_MIN_LENGTH, matchingPasswords } from '../../shared/validators';

type Msg = { tone: 'success' | 'error'; text: string } | null;

@Component({
  selector: 'sv-account-page',
  imports: [ReactiveFormsModule, RouterLink, LucideDynamicIcon, TopBar, PageHeaderComponent, SectionComponent, FieldComponent,
    ButtonComponent, AlertComponent, BadgeComponent, LoadingComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-top-bar />
    <main class="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
      <a routerLink="/" class="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"><svg [lucideIcon]="icons.chevronLeft" [size]="16" />Wróć do panelu</a>
      <sv-page-header title="Ustawienia konta" [description]="session.user()?.email ?? ''" />

      <sv-section title="Profil" description="Twoje imię i nazwisko widzą inni członkowie zespołu.">
        <form [formGroup]="profile" (ngSubmit)="saveProfile()" class="space-y-4" novalidate>
          @if (profileMsg(); as m) {<sv-alert [tone]="m.tone">{{ m.text }}</sv-alert>}
          <div class="grid gap-4 sm:grid-cols-2">
            <sv-field label="Imię" for="firstName" [error]="err(profile.controls.firstName)">
              <input id="firstName" class="sv-input" formControlName="firstName" autocomplete="given-name" />
            </sv-field>
            <sv-field label="Nazwisko" for="lastName" [error]="err(profile.controls.lastName)">
              <input id="lastName" class="sv-input" formControlName="lastName" autocomplete="family-name" />
            </sv-field>
          </div>
          <div class="flex justify-end"><button sv-button type="submit" [loading]="savingProfile()">Zapisz</button></div>
        </form>
      </sv-section>

      <sv-section title="Hasło" description="Po zmianie hasła pozostałe sesje zostaną wylogowane.">
        <form [formGroup]="password" (ngSubmit)="changePassword()" class="space-y-4" novalidate>
          @if (passwordMsg(); as m) {<sv-alert [tone]="m.tone">{{ m.text }}</sv-alert>}
          <sv-field label="Obecne hasło" for="currentPassword" [error]="err(password.controls.currentPassword)">
            <input id="currentPassword" type="password" class="sv-input" formControlName="currentPassword" autocomplete="current-password" />
          </sv-field>
          <sv-field label="Nowe hasło" for="newPassword" [error]="err(password.controls.password)" hint="Co najmniej 10 znaków.">
            <input id="newPassword" type="password" class="sv-input" formControlName="password" autocomplete="new-password" />
          </sv-field>
          <sv-field label="Powtórz nowe hasło" for="confirmPassword" [error]="err(password.controls.confirmPassword)">
            <input id="confirmPassword" type="password" class="sv-input" formControlName="confirmPassword" autocomplete="new-password" />
          </sv-field>
          <div class="flex justify-end"><button sv-button type="submit" [loading]="savingPassword()">Zmień hasło</button></div>
        </form>
      </sv-section>

      <sv-section title="Weryfikacja dwuetapowa"
        description="Przy logowaniu oprócz hasła wymagany będzie kod z aplikacji (np. Google Authenticator, 1Password, Authy).">
        @if (mfaMsg(); as m) {<sv-alert [tone]="m.tone" class="mb-4">{{ m.text }}</sv-alert>}
        @if (recoveryCodes(); as codes) {
          <sv-alert tone="warning" heading="Zapisz kody zapasowe">
            Każdy kod działa jednorazowo, gdy nie masz dostępu do telefonu. Nie pokażemy ich ponownie.
          </sv-alert>
          <ul class="mt-4 grid grid-cols-2 gap-2 rounded-[var(--radius-control)] border border-line bg-canvas p-4 font-mono text-[13px] text-ink">
            @for (c of codes; track c) {<li>{{ c }}</li>}
          </ul>
          <div class="mt-4 flex gap-2">
            <button sv-button variant="secondary" (click)="copyCodes(codes)">{{ copied() ? 'Skopiowano' : 'Kopiuj kody' }}</button>
            <button sv-button (click)="recoveryCodes.set(null)">Zapisałem kody</button>
          </div>
        } @else if (mfa.isLoading()) {
          <sv-loading />
        } @else if (mfa.value()?.enabled) {
          <div class="flex items-center gap-2"><sv-badge tone="success">Włączona</sv-badge>
            <span class="text-[13px] text-ink-soft">Pozostałe kody zapasowe: {{ mfa.value()?.remainingRecoveryCodes }}</span>
          </div>
          <form [formGroup]="disableForm" (ngSubmit)="disableMfa()" class="mt-6 space-y-4 border-t border-line pt-6" novalidate>
            <p class="text-[13px] font-medium">Wyłącz weryfikację dwuetapową</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <sv-field label="Hasło" for="disable-password" [error]="err(disableForm.controls.password)">
                <input id="disable-password" type="password" class="sv-input" formControlName="password" autocomplete="current-password" />
              </sv-field>
              <sv-field label="Kod z aplikacji" for="disable-code" [error]="err(disableForm.controls.code)">
                <input id="disable-code" class="sv-input font-mono" formControlName="code" inputmode="numeric" autocomplete="one-time-code" />
              </sv-field>
            </div>
            <div class="flex justify-end"><button sv-button variant="danger" type="submit" [loading]="mfaBusy()">Wyłącz</button></div>
          </form>
        } @else if (setup(); as s) {
          <ol class="space-y-5 text-[13px]">
            <li>
              <p class="font-medium">1. Zeskanuj kod QR w aplikacji uwierzytelniającej</p>
              @if (qr()) {<img [src]="qr()" alt="Kod QR do konfiguracji aplikacji uwierzytelniającej" class="mt-3 size-44 rounded border border-line" />}
              <p class="mt-2 text-ink-soft">Nie możesz zeskanować? Wpisz klucz ręcznie:</p>
              <code class="mt-1 inline-block break-all rounded bg-canvas px-2 py-1 font-mono text-[12px]">{{ s.secret }}</code>
            </li>
            <li>
              <p class="font-medium">2. Wpisz kod wyświetlony w aplikacji</p>
              <form [formGroup]="confirmForm" (ngSubmit)="confirmMfa()" class="mt-3 flex max-w-sm gap-2" novalidate>
                <label for="confirm-code" class="sr-only">Kod z aplikacji</label>
                <input id="confirm-code" class="sv-input font-mono tracking-[0.2em]" formControlName="code" inputmode="numeric"
                  maxlength="6" autocomplete="one-time-code" />
                <button sv-button type="submit" [loading]="mfaBusy()">Włącz</button>
              </form>
            </li>
          </ol>
        } @else {
          <div class="flex items-center gap-3">
            <sv-badge tone="warning">Wyłączona</sv-badge>
            <button sv-button (click)="startMfa()" [loading]="mfaBusy()">Skonfiguruj</button>
          </div>
        }
      </sv-section>

      <sv-section title="Aktywne sesje" description="Urządzenia, na których jesteś zalogowany.">
        @if (sessions.isLoading()) {
          <sv-loading />
        } @else {
          <ul class="divide-y divide-line rounded-[var(--radius-control)] border border-line">
            @for (s of sessions.value(); track s.id) {
              <li class="flex items-center justify-between gap-4 px-4 py-3">
                <div class="min-w-0">
                  <p class="font-medium">{{ device(s.userAgent) }}
                    @if (s.current) {<sv-badge tone="success" class="ml-1">To urządzenie</sv-badge>}
                  </p>
                  <p class="text-[12px] text-ink-muted">{{ s.ipAddress ?? 'IP nieznany' }} · ostatnio {{ s.lastSeenAt | svDate: 'relative' }}</p>
                </div>
                @if (!s.current) {<button sv-button variant="ghost" size="sm" (click)="revoke(s.id)">Wyloguj</button>}
              </li>
            }
          </ul>
          @if ((sessions.value()?.length ?? 0) > 1) {
            <button sv-button variant="secondary" class="mt-4" (click)="revokeOthers()">Wyloguj wszystkie inne urządzenia</button>
          }
        }
      </sv-section>

      <div class="py-8">
        <button sv-button variant="secondary" (click)="logout()">Wyloguj się</button>
      </div>
    </main>
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionStore);
  private readonly api = inject(AccountApi);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly device = describeUserAgent;
  protected readonly icons = icons;
  private readonly toast = inject(ToastService);

  protected readonly profileMsg = signal<Msg>(null);
  protected readonly passwordMsg = signal<Msg>(null);
  protected readonly mfaMsg = signal<Msg>(null);
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly mfaBusy = signal(false);
  protected readonly setup = signal<TotpSetup | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly recoveryCodes = signal<string[] | null>(null);
  protected readonly copied = signal(false);

  protected readonly profile = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
  });
  protected readonly password = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords() },
  );
  protected readonly confirmForm = this.fb.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  protected readonly disableForm = this.fb.group({ password: ['', Validators.required], code: ['', Validators.required] });

  protected readonly sessions = rxResource({ stream: () => this.api.sessions() });
  protected readonly mfa = rxResource({ stream: () => this.api.mfaStatus() });

  constructor() {
    effect(() => {
      const user = this.session.user();
      if (user) this.profile.reset({ firstName: user.firstName, lastName: user.lastName });
    });
  }

  protected err(control: Parameters<typeof controlError>[0]): string | null {
    return controlError(control);
  }

  async saveProfile(): Promise<void> {
    if (this.profile.invalid) return this.profile.markAllAsTouched();
    this.savingProfile.set(true);
    this.profileMsg.set(null);
    const { firstName, lastName } = this.profile.getRawValue();
    try {
      await firstValueFrom(this.api.updateProfile(firstName.trim(), lastName.trim(), this.session.user()?.locale ?? 'pl-PL'));
      await this.session.refresh();
      this.toast.success('Zapisano profil.');
    } catch (e) {
      this.profileMsg.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.savingProfile.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.password.invalid) return this.password.markAllAsTouched();
    this.savingPassword.set(true);
    this.passwordMsg.set(null);
    const v = this.password.getRawValue();
    try {
      await firstValueFrom(this.api.changePassword(v.currentPassword, v.password));
      this.password.reset();
      this.toast.success('Hasło zostało zmienione. Inne sesje zostały wylogowane.');
      this.sessions.reload();
    } catch (e) {
      this.passwordMsg.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.savingPassword.set(false);
    }
  }

  async startMfa(): Promise<void> {
    this.mfaBusy.set(true);
    this.mfaMsg.set(null);
    try {
      const setup = await firstValueFrom(this.api.startTotpSetup());
      this.setup.set(setup);
      this.qr.set(await toDataURL(setup.otpauthUri, { margin: 1, width: 352 }));
    } catch (e) {
      this.mfaMsg.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.mfaBusy.set(false);
    }
  }

  async confirmMfa(): Promise<void> {
    if (this.confirmForm.invalid) return this.confirmForm.markAllAsTouched();
    this.mfaBusy.set(true);
    this.mfaMsg.set(null);
    try {
      const { recoveryCodes } = await firstValueFrom(this.api.confirmTotp(this.confirmForm.controls.code.value));
      this.recoveryCodes.set(recoveryCodes);
      this.setup.set(null);
      this.confirmForm.reset();
      this.mfa.reload();
      this.sessions.reload();
      await this.session.refresh();
    } catch (e) {
      this.mfaMsg.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.mfaBusy.set(false);
    }
  }

  async disableMfa(): Promise<void> {
    if (this.disableForm.invalid) return this.disableForm.markAllAsTouched();
    this.mfaBusy.set(true);
    this.mfaMsg.set(null);
    const v = this.disableForm.getRawValue();
    try {
      await firstValueFrom(this.api.disableMfa(v.password, v.code.trim()));
      this.disableForm.reset();
      this.mfa.reload();
      await this.session.refresh();
      this.mfaMsg.set({ tone: 'success', text: 'Weryfikacja dwuetapowa została wyłączona.' });
    } catch (e) {
      this.mfaMsg.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.mfaBusy.set(false);
    }
  }

  async copyCodes(codes: string[]): Promise<void> {
    await navigator.clipboard.writeText(codes.join('\n'));
    this.copied.set(true);
  }

  async revoke(id: string): Promise<void> {
    await firstValueFrom(this.api.revokeSession(id));
    this.sessions.reload();
  }

  async revokeOthers(): Promise<void> {
    await firstValueFrom(this.api.revokeOtherSessions());
    this.sessions.reload();
  }

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
