import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountApi, ApiError, SessionStore } from '@shopivo/api-client';
import { TotpSetup } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DatePipe, FieldComponent, LoadingComponent,
  AvatarComponent, TabsComponent, ToastService, controlError, describeUserAgent, icons,
} from '@shopivo/shared-ui';
import { BackIconComponent } from '@shopivo/shared-ui';
import { LucideDynamicIcon } from '@lucide/angular';
import { TopBar } from '../onboarding/top-bar';
import { toDataURL } from 'qrcode';
import { firstValueFrom } from 'rxjs';
import { PASSWORD_MIN_LENGTH, matchingPasswords } from '../../shared/validators';

type Msg = { tone: 'success' | 'error'; text: string } | null;

@Component({
  selector: 'sv-account-page',
  imports: [BackIconComponent, ReactiveFormsModule, RouterLink, LucideDynamicIcon, TopBar, TabsComponent, AvatarComponent, FieldComponent,
    ButtonComponent, AlertComponent, BadgeComponent, LoadingComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-top-bar />
    <main class="mx-auto max-w-[880px] px-4 py-8 sm:px-6">
      <a routerLink="/" class="group inline-flex items-center text-[13px] text-ink-muted hover:text-ink"><sv-back-icon icon="dashboard" [size]="15" label="Wróć do panelu" /></a>
      <div class="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 class="text-[24px] font-semibold tracking-[-0.02em] text-ink">Konto</h1>
        <sv-tabs label="Sekcje konta" [tabs]="tabs" [(active)]="tab" />
      </div>

      @switch (tab()) {
        @case ('profile') {
          <form id="panel-profile" role="tabpanel" aria-labelledby="tab-profile" [formGroup]="profile" (ngSubmit)="saveProfile()" class="sv-card mt-5" novalidate>
            <div class="flex items-center gap-4 px-5 pt-5">
              <sv-avatar [name]="(session.user()?.firstName ?? '') + ' ' + (session.user()?.lastName ?? '')" size="lg" />
              <div class="min-w-0">
                <p class="truncate text-[15px] font-semibold text-ink">{{ session.user()?.firstName }} {{ session.user()?.lastName }}</p>
                <p class="truncate text-[13px] text-ink-muted">{{ session.user()?.email }}</p>
              </div>
            </div>
            <div class="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
              @if (profileMsg(); as m) {<sv-alert [tone]="m.tone" class="md:col-span-2">{{ m.text }}</sv-alert>}
              <sv-field label="Imię" for="firstName" [error]="err(profile.controls.firstName)">
                <input id="firstName" class="sv-input" formControlName="firstName" autocomplete="given-name" />
              </sv-field>
              <sv-field label="Nazwisko" for="lastName" [error]="err(profile.controls.lastName)">
                <input id="lastName" class="sv-input" formControlName="lastName" autocomplete="family-name" />
              </sv-field>
            </div>
            <div class="sv-card-footer">
              <button sv-button type="submit" [disabled]="profile.pristine" [loading]="savingProfile()">Zapisz</button>
            </div>
          </form>
        }
        @case ('security') {
          <div id="panel-security" role="tabpanel" aria-labelledby="tab-security">
            <form [formGroup]="password" (ngSubmit)="changePassword()" class="sv-card mt-5" novalidate>
              <div class="px-5 pb-1 pt-5">
                <h2 class="text-[15px] font-semibold text-ink">Hasło</h2>
                <p class="mt-0.5 text-[12px] text-ink-muted">Po zmianie pozostałe urządzenia zostaną wylogowane.</p>
              </div>
              <div class="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
                @if (passwordMsg(); as m) {<sv-alert [tone]="m.tone" class="md:col-span-2">{{ m.text }}</sv-alert>}
                <sv-field label="Obecne hasło" for="currentPassword" [error]="err(password.controls.currentPassword)" class="md:col-span-2 md:max-w-[calc(50%-10px)]">
                  <input id="currentPassword" type="password" class="sv-input" formControlName="currentPassword" autocomplete="current-password" />
                </sv-field>
                <sv-field label="Nowe hasło" for="newPassword" [error]="err(password.controls.password)" hint="Co najmniej 10 znaków.">
                  <input id="newPassword" type="password" class="sv-input" formControlName="password" autocomplete="new-password" />
                </sv-field>
                <sv-field label="Powtórz nowe hasło" for="confirmPassword" [error]="err(password.controls.confirmPassword)">
                  <input id="confirmPassword" type="password" class="sv-input" formControlName="confirmPassword" autocomplete="new-password" />
                </sv-field>
              </div>
              <div class="sv-card-footer">
                <button sv-button type="submit" [disabled]="password.pristine" [loading]="savingPassword()">Zmień hasło</button>
              </div>
            </form>

            <section class="sv-card mt-4" aria-labelledby="mfa-title">
              <div class="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
                <div>
                  <h2 id="mfa-title" class="text-[15px] font-semibold text-ink">Weryfikacja dwuetapowa</h2>
                  <p class="mt-0.5 text-[12px] text-ink-muted">Kod z aplikacji (Google Authenticator, 1Password, Authy) przy każdym logowaniu.</p>
                </div>
                @if (!mfa.isLoading() && !recoveryCodes()) {
                  <sv-badge [tone]="mfa.value()?.enabled ? 'success' : 'warning'">{{ mfa.value()?.enabled ? 'Włączona' : 'Wyłączona' }}</sv-badge>
                }
              </div>
              <div class="p-5">
                @if (mfaMsg(); as m) {<sv-alert [tone]="m.tone" class="mb-4">{{ m.text }}</sv-alert>}
                @if (recoveryCodes(); as codes) {
                  <sv-alert tone="warning" heading="Zapisz kody zapasowe">
                    Każdy kod działa jednorazowo, gdy nie masz dostępu do telefonu. Nie pokażemy ich ponownie.
                  </sv-alert>
                  <ul class="mt-4 grid grid-cols-2 gap-2 rounded-[10px] bg-[#F7F8F5] p-4 font-mono text-[13px] text-ink sm:grid-cols-5">
                    @for (c of codes; track c) {<li>{{ c }}</li>}
                  </ul>
                  <div class="mt-4 flex gap-2">
                    <button sv-button variant="secondary" (click)="copyCodes(codes)">{{ copied() ? 'Skopiowano' : 'Kopiuj kody' }}</button>
                    <button sv-button (click)="recoveryCodes.set(null)">Zapisałem kody</button>
                  </div>
                } @else if (mfa.isLoading()) {
                  <sv-loading variant="form" />
                } @else if (mfa.value()?.enabled) {
                  <p class="text-[13px] text-ink-soft">Pozostałe kody zapasowe: <strong class="text-ink">{{ mfa.value()?.remainingRecoveryCodes }}</strong></p>
                  <form [formGroup]="disableForm" (ngSubmit)="disableMfa()" class="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end" novalidate>
                    <sv-field label="Hasło" for="disable-password" [error]="err(disableForm.controls.password)">
                      <input id="disable-password" type="password" class="sv-input" formControlName="password" autocomplete="current-password" />
                    </sv-field>
                    <sv-field label="Kod z aplikacji" for="disable-code" [error]="err(disableForm.controls.code)">
                      <input id="disable-code" class="sv-input font-mono" formControlName="code" inputmode="numeric" autocomplete="one-time-code" />
                    </sv-field>
                    <button sv-button variant="secondary" type="submit" [loading]="mfaBusy()">Wyłącz</button>
                  </form>
                } @else if (setup(); as s) {
                  <div class="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
                    @if (qr()) {<img [src]="qr()" alt="Kod QR do konfiguracji aplikacji uwierzytelniającej" class="size-40 rounded-[10px] border border-line" />}
                    <div class="text-[13px]">
                      <p class="font-medium text-ink">1. Zeskanuj kod QR w aplikacji</p>
                      <p class="mt-1 text-ink-muted">Albo wpisz klucz ręcznie:</p>
                      <code class="mt-1 inline-block break-all rounded-[8px] bg-[#F2F3F0] px-2.5 py-1.5 font-mono text-[12px] text-ink">{{ s.secret }}</code>
                      <p class="mt-5 font-medium text-ink">2. Wpisz kod z aplikacji</p>
                      <form [formGroup]="confirmForm" (ngSubmit)="confirmMfa()" class="mt-2 flex max-w-xs gap-2" novalidate>
                        <label for="confirm-code" class="sr-only">Kod z aplikacji</label>
                        <input id="confirm-code" class="sv-input font-mono tracking-[0.2em]" formControlName="code" inputmode="numeric"
                          maxlength="6" autocomplete="one-time-code" placeholder="000000" />
                        <button sv-button type="submit" [loading]="mfaBusy()">Włącz</button>
                      </form>
                    </div>
                  </div>
                } @else {
                  <button sv-button (click)="startMfa()" [loading]="mfaBusy()"><svg [lucideIcon]="icons.shieldCheck" />Skonfiguruj</button>
                }
              </div>
            </section>
          </div>
        }
        @case ('sessions') {
          <section id="panel-sessions" role="tabpanel" aria-labelledby="tab-sessions" class="sv-card mt-5">
            <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <div>
                <h2 class="text-[15px] font-semibold text-ink">Aktywne sesje</h2>
                <p class="mt-0.5 text-[12px] text-ink-muted">Urządzenia, na których jesteś zalogowany.</p>
              </div>
              @if ((sessions.value()?.length ?? 0) > 1) {
                <button sv-button variant="secondary" size="sm" (click)="revokeOthers()">Wyloguj pozostałe</button>
              }
            </div>
            @if (sessions.isLoading()) {
              <sv-loading variant="form" />
            } @else {
              <ul class="px-5 pb-2 pt-3">
                @for (s of sessions.value(); track s.id) {
                  <li class="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                    <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F2F3F0] text-ink-muted">
                      <svg [lucideIcon]="icons.globeIcon" [size]="16" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[13px] font-medium text-ink">{{ device(s.userAgent) }}
                        @if (s.current) {<sv-badge tone="success" class="ml-1">To urządzenie</sv-badge>}
                      </p>
                      <p class="truncate text-[12px] text-ink-muted">{{ s.ipAddress ?? 'IP nieznany' }} · {{ s.lastSeenAt | svDate: 'relative' }}</p>
                    </div>
                    @if (!s.current) {<button sv-button variant="ghost" size="sm" (click)="revoke(s.id)">Wyloguj</button>}
                  </li>
                }
              </ul>
            }
            <div class="sv-card-footer justify-between">
              <span class="text-[12px] text-ink-muted">Zakończ też sesję na tym urządzeniu</span>
              <button sv-button variant="secondary" size="sm" (click)="logout()"><svg [lucideIcon]="icons.logout" />Wyloguj się</button>
            </div>
          </section>
        }
      }
    </main>
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionStore);
  private readonly api = inject(AccountApi);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly device = describeUserAgent;
  protected readonly icons = { ...icons, globeIcon: icons.domains };
  protected readonly tabs = [
    { id: 'profile', label: 'Profil' },
    { id: 'security', label: 'Bezpieczeństwo' },
    { id: 'sessions', label: 'Sesje' },
  ];
  protected readonly tab = signal('profile');
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
