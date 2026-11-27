import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountApi, ApiError, SessionStore, StoresApi } from '@shopivo/api-client';
import { MyStore, STORE_ROLE_LABELS, TotpSetup } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DatePipe, FieldComponent, LoadingComponent,
  AvatarComponent, IconName, ToastService, controlError, describeUserAgent, icons,
} from '@shopivo/shared-ui';
import { BackIconComponent } from '@shopivo/shared-ui';
import { LucideDynamicIcon } from '@lucide/angular';
import { TopBar } from '../onboarding/top-bar';
import { toDataURL } from 'qrcode';
import { firstValueFrom } from 'rxjs';
import { PASSWORD_MIN_LENGTH, matchingPasswords } from '../../shared/validators';

type Msg = { tone: 'success' | 'error'; text: string } | null;


interface Section { id: string; label: string; icon: IconName }

@Component({
  selector: 'sv-account-page',
  host: { '(window:scroll)': 'onScroll()' },
  imports: [BackIconComponent, ReactiveFormsModule, RouterLink, LucideDynamicIcon, TopBar, AvatarComponent, FieldComponent,
    ButtonComponent, AlertComponent, BadgeComponent, LoadingComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-top-bar />
    <main class="mx-auto max-w-[1040px] px-4 pb-16 pt-8 sm:px-6">
      <a routerLink="/" class="group inline-flex items-center text-[13px] text-ink-muted hover:text-ink"><sv-back-icon icon="dashboard" [size]="15" label="Wróć do panelu" /></a>

      <div class="mt-4 grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <!-- Section menu (desktop) -->
        <nav aria-label="Sekcje konta" class="hidden lg:block">
          <ul class="sticky top-6 space-y-0.5">
            @for (s of sections; track s.id) {
              <li><button type="button" class="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors"
                [class]="active() === s.id ? 'bg-canvas font-medium text-ink' : 'text-ink-soft hover:bg-hover hover:text-ink'" (click)="go(s.id)">
                <svg [lucideIcon]="icons[s.icon]" [size]="16" [strokeWidth]="1.75" />{{ s.label }}</button></li>
            }
          </ul>
        </nav>

        <div class="min-w-0 space-y-9">
          <!-- Identity -->
          <header class="flex flex-wrap items-center gap-4">
            <sv-avatar [name]="fullName()" size="lg" />
            <div class="min-w-0 flex-1">
              <h1 class="truncate text-[24px] font-semibold tracking-[-0.02em] text-ink">{{ fullName() || 'Konto' }}</h1>
              <p class="truncate text-[13.5px] text-ink-soft">{{ session.user()?.email }}</p>
            </div>
            <div class="flex w-full flex-wrap gap-2 sm:w-auto">
              <span class="settings-pill inline-flex items-center gap-1.5">
                <span class="size-1.5 rounded-full" [class]="mfa.value()?.enabled ? 'bg-success' : 'bg-warning'"></span>
                {{ mfa.value()?.enabled ? 'Weryfikacja dwuetapowa włączona' : 'Bez weryfikacji dwuetapowej' }}</span>
              @if (stores.value(); as list) {<span class="settings-pill">{{ list.length }} {{ list.length === 1 ? 'sklep' : (list.length < 5 && list.length > 1 ? 'sklepy' : 'sklepów') }}</span>}
            </div>
          </header>

          <!-- Profile -->
          <section id="profil" class="scroll-mt-6" aria-labelledby="h-profile">
            <h2 id="h-profile" class="acc-h">Profil</h2>
            <p class="acc-p">Imię i nazwisko widzą członkowie zespołu Twoich sklepów i dziennik zdarzeń.</p>
            <form id="profile-form" [formGroup]="profile" (ngSubmit)="saveProfile()" class="sv-card mt-3 overflow-hidden p-0" novalidate>
              <div class="grid gap-4 p-5 md:grid-cols-2">
                @if (profileMsg(); as m) {<sv-alert [tone]="m.tone" class="md:col-span-2">{{ m.text }}</sv-alert>}
                <sv-field label="Imię" for="firstName" [error]="err(profile.controls.firstName)">
                  <input id="firstName" class="sv-input" formControlName="firstName" autocomplete="given-name" maxlength="100" />
                </sv-field>
                <sv-field label="Nazwisko" for="lastName" [error]="err(profile.controls.lastName)">
                  <input id="lastName" class="sv-input" formControlName="lastName" autocomplete="family-name" maxlength="100" />
                </sv-field>
              </div>
              <div class="settings-item cursor-default border-t border-line">
                <svg [lucideIcon]="icons.mail" [size]="17" class="text-ink-soft" />
                <span class="min-w-0 flex-1"><span class="block">Adres e-mail</span>
                  <span class="block truncate text-[12.5px] text-ink-muted">{{ session.user()?.email }} — login do panelu i adres powiadomień</span></span>
                <span class="settings-pill inline-flex items-center gap-1"><svg [lucideIcon]="icons.check" [size]="12" />Potwierdzony</span>
              </div>
            </form>
          </section>

          <!-- Security -->
          <section id="bezpieczenstwo" class="scroll-mt-6" aria-labelledby="h-security">
            <h2 id="h-security" class="acc-h">Bezpieczeństwo</h2>
            <p class="acc-p">Hasło i weryfikacja dwuetapowa chronią dostęp do sklepów, zamówień i danych klientów.</p>
            @if (!mfa.isLoading() && !mfa.value()?.enabled && !setup() && !recoveryCodes()) {
              <div class="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] bg-[#FFF6E5] px-4 py-3 text-[13px] text-warning-ink">
                <svg [lucideIcon]="icons.shield" [size]="18" class="shrink-0" />
                <span class="min-w-0 flex-1">Włącz weryfikację dwuetapową — samo hasło to za mało, gdy masz dostęp do danych klientów.</span>
                <button sv-button size="sm" (click)="startMfa()" [loading]="mfaBusy()">Włącz teraz</button>
              </div>
            }
            <div class="sv-card mt-3 divide-y divide-line overflow-hidden p-0">
              <!-- Password -->
              <div>
                <div class="settings-item cursor-default">
                  <svg [lucideIcon]="icons.lock" [size]="17" class="text-ink-soft" />
                  <span class="min-w-0 flex-1"><span class="block">Hasło</span>
                    <span class="block text-[12.5px] text-ink-muted">Po zmianie wylogujemy Cię z pozostałych urządzeń.</span></span>
                  @if (!passwordOpen()) {<button sv-button variant="tonal" size="sm" (click)="passwordOpen.set(true)">Zmień hasło</button>}
                </div>
                @if (passwordOpen()) {
                  <form [formGroup]="password" (ngSubmit)="changePassword()" class="grid gap-4 bg-[#FAFBF9] px-5 pb-5 pt-1 md:grid-cols-2" novalidate>
                    @if (passwordMsg(); as m) {<sv-alert [tone]="m.tone" class="md:col-span-2">{{ m.text }}</sv-alert>}
                    <sv-field label="Obecne hasło" for="currentPassword" [error]="err(password.controls.currentPassword)" class="md:col-span-2 md:max-w-[calc(50%-8px)]">
                      <input id="currentPassword" type="password" class="sv-input" formControlName="currentPassword" autocomplete="current-password" />
                    </sv-field>
                    <sv-field label="Nowe hasło" for="newPassword" [error]="err(password.controls.password)" hint="Co najmniej 10 znaków.">
                      <input id="newPassword" type="password" class="sv-input" formControlName="password" autocomplete="new-password" />
                    </sv-field>
                    <sv-field label="Powtórz nowe hasło" for="confirmPassword" [error]="err(password.controls.confirmPassword)">
                      <input id="confirmPassword" type="password" class="sv-input" formControlName="confirmPassword" autocomplete="new-password" />
                    </sv-field>
                    <div class="flex justify-end gap-2 md:col-span-2">
                      <button sv-button variant="secondary" type="button" (click)="cancelPassword()">Anuluj</button>
                      <button sv-button type="submit" [loading]="savingPassword()">Zmień hasło</button>
                    </div>
                  </form>
                }
              </div>

              <!-- Two-step verification -->
              <div>
                <div class="settings-item cursor-default">
                  <svg [lucideIcon]="icons.shieldCheck" [size]="17" class="text-ink-soft" />
                  <span class="min-w-0 flex-1"><span class="block">Weryfikacja dwuetapowa</span>
                    <span class="block text-[12.5px] text-ink-muted">{{ mfa.value()?.enabled ? 'Włączona — ' : '' }}kod z aplikacji (np. Google Authenticator, 1Password) przy logowaniu.</span></span>
                  @if (!mfa.isLoading() && !recoveryCodes()) {
                    <sv-badge class="hidden sm:inline-flex" [tone]="mfa.value()?.enabled ? 'success' : 'warning'">{{ mfa.value()?.enabled ? 'Włączona' : 'Wyłączona' }}</sv-badge>
                    @if (mfa.value()?.enabled && !disableOpen()) {<button sv-button variant="tonal" size="sm" (click)="disableOpen.set(true)">Wyłącz</button>}
                    @if (!mfa.value()?.enabled && !setup()) {<button sv-button variant="tonal" size="sm" (click)="startMfa()" [loading]="mfaBusy()">Skonfiguruj</button>}
                  }
                </div>
                @if (mfaMsg(); as m) {<div class="px-5 pb-4"><sv-alert [tone]="m.tone">{{ m.text }}</sv-alert></div>}
                @if (recoveryCodes(); as codes) {
                  <div class="bg-[#FAFBF9] px-5 pb-5 pt-1">
                    <sv-alert tone="warning" heading="Zapisz kody zapasowe">Każdy kod działa jednorazowo, gdy nie masz dostępu do telefonu. Nie pokażemy ich ponownie.</sv-alert>
                    <ul class="mt-4 grid grid-cols-2 gap-2 rounded-[10px] border border-line bg-white p-4 font-mono text-[13px] text-ink sm:grid-cols-5">
                      @for (c of codes; track c) {<li>{{ c }}</li>}
                    </ul>
                    <div class="mt-4 flex justify-end gap-2">
                      <button sv-button variant="secondary" (click)="copyCodes(codes)"><svg [lucideIcon]="icons.copy" />{{ copied() ? 'Skopiowano' : 'Kopiuj kody' }}</button>
                      <button sv-button (click)="recoveryCodes.set(null)">Zapisałem kody</button>
                    </div>
                  </div>
                } @else if (setup(); as s) {
                  <div class="grid gap-6 bg-[#FAFBF9] px-5 pb-5 pt-1 md:grid-cols-[auto_minmax(0,1fr)]">
                    @if (qr()) {<img [src]="qr()" alt="Kod QR do konfiguracji aplikacji uwierzytelniającej" class="size-40 rounded-[10px] border border-line bg-white" />}
                    <div class="text-[13px]">
                      <p class="font-medium text-ink">1. Zeskanuj kod QR w aplikacji</p>
                      <p class="mt-1 text-ink-muted">Albo wpisz klucz ręcznie:</p>
                      <code class="mt-1 inline-block break-all rounded-[8px] border border-line bg-white px-2.5 py-1.5 font-mono text-[12px] text-ink">{{ s.secret }}</code>
                      <p class="mt-5 font-medium text-ink">2. Wpisz 6-cyfrowy kod z aplikacji</p>
                      <form [formGroup]="confirmForm" (ngSubmit)="confirmMfa()" class="mt-2 flex max-w-sm gap-2" novalidate>
                        <label for="confirm-code" class="sr-only">Kod z aplikacji</label>
                        <input id="confirm-code" class="sv-input font-mono tracking-[0.2em]" formControlName="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
                        <button sv-button type="submit" [loading]="mfaBusy()">Włącz</button>
                        <button sv-button variant="ghost" type="button" (click)="setup.set(null)">Anuluj</button>
                      </form>
                    </div>
                  </div>
                } @else if (mfa.value()?.enabled && disableOpen()) {
                  <form [formGroup]="disableForm" (ngSubmit)="disableMfa()" class="grid gap-4 bg-[#FAFBF9] px-5 pb-5 pt-1 md:grid-cols-2" novalidate>
                    <p class="text-[13px] text-ink-soft md:col-span-2">Aby wyłączyć, potwierdź hasłem i kodem z aplikacji (albo kodem zapasowym).</p>
                    <sv-field label="Hasło" for="disable-password" [error]="err(disableForm.controls.password)">
                      <input id="disable-password" type="password" class="sv-input" formControlName="password" autocomplete="current-password" />
                    </sv-field>
                    <sv-field label="Kod z aplikacji" for="disable-code" [error]="err(disableForm.controls.code)">
                      <input id="disable-code" class="sv-input font-mono" formControlName="code" inputmode="numeric" autocomplete="one-time-code" />
                    </sv-field>
                    <div class="flex justify-end gap-2 md:col-span-2">
                      <button sv-button variant="secondary" type="button" (click)="disableOpen.set(false); disableForm.reset()">Anuluj</button>
                      <button sv-button variant="danger" type="submit" [loading]="mfaBusy()">Wyłącz weryfikację</button>
                    </div>
                  </form>
                }
              </div>

              @if (mfa.value()?.enabled) {
                <div class="settings-item cursor-default">
                  <svg [lucideIcon]="icons.legal" [size]="17" class="text-ink-soft" />
                  <span class="min-w-0 flex-1"><span class="block">Kody zapasowe</span>
                    <span class="block text-[12.5px] text-ink-muted">Na wypadek utraty telefonu. Każdy działa raz.</span></span>
                  <span class="settings-pill" [class.!bg-[#FFF0D6]]="(mfa.value()?.remainingRecoveryCodes ?? 0) <= 2">Pozostało: {{ mfa.value()?.remainingRecoveryCodes }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Devices -->
          <section id="urzadzenia" class="scroll-mt-6" aria-labelledby="h-devices">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="h-devices" class="acc-h">Urządzenia i sesje</h2>
                <p class="acc-p">Gdzie jesteś zalogowany. Nie rozpoznajesz urządzenia? Wyloguj je i zmień hasło.</p>
              </div>
              @if ((sessions.value()?.length ?? 0) > 1) {
                <button sv-button variant="secondary" size="sm" (click)="revokeOthers()">Wyloguj pozostałe</button>
              }
            </div>
            <div class="sv-card mt-3 overflow-hidden p-0">
              @if (sessions.isLoading() && !sessions.value()) {
                <sv-loading variant="table" [rows]="2" />
              } @else {
                <ul class="divide-y divide-line">
                  @for (s of sessions.value(); track s.id) {
                    <li class="flex items-center gap-3 px-5 py-3.5">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-canvas text-ink-soft">
                        <svg [lucideIcon]="isMobile(s.userAgent) ? icons.smartphone : icons.monitor" [size]="18" [strokeWidth]="1.75" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="flex items-center gap-2 truncate text-[13.5px] font-medium text-ink">{{ device(s.userAgent) }}
                          @if (s.current) {<sv-badge tone="success">To urządzenie</sv-badge>}</p>
                        <p class="truncate text-[12.5px] text-ink-muted">{{ s.ipAddress ?? 'IP nieznany' }} · {{ s.current ? 'aktywna teraz' : 'ostatnio ' + (s.lastSeenAt | svDate: 'relative') }}</p>
                      </div>
                      @if (!s.current) {<button sv-button variant="ghost" size="sm" (click)="revoke(s.id)">Wyloguj</button>}
                    </li>
                  }
                </ul>
              }
            </div>
          </section>

          <!-- Stores -->
          <section id="sklepy" class="scroll-mt-6" aria-labelledby="h-stores">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="h-stores" class="acc-h">Twoje sklepy</h2>
                <p class="acc-p">Sklepy, do których masz dostęp, i Twoja rola w każdym z nich.</p>
              </div>
              <a sv-button variant="secondary" size="sm" routerLink="/nowy-sklep"><svg [lucideIcon]="icons.plus" />Nowy sklep</a>
            </div>
            <div class="sv-card mt-3 overflow-hidden p-0">
              @if (stores.isLoading() && !stores.value()) {
                <sv-loading variant="table" [rows]="2" />
              } @else {
                <ul class="divide-y divide-line">
                  @for (st of stores.value(); track st.tenantId) {
                    <li>
                      <a class="flex items-center gap-3 px-5 py-3.5 hover:bg-hover" [routerLink]="['/sklep', st.tenantId]">
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-neon text-[13px] font-semibold text-on-neon">{{ initials(st.name) }}</span>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-[13.5px] font-medium text-ink">{{ st.name }}</span>
                          <span class="block truncate text-[12.5px] text-ink-muted">{{ st.primaryHostname || st.slug }}</span>
                        </span>
                        <span class="settings-pill hidden sm:inline">{{ roleLabels[st.role] }}</span>
                        <sv-badge [tone]="st.tenantStatus !== 'ACTIVE' ? 'danger' : st.status === 'PUBLISHED' ? 'success' : 'neutral'">{{ storeStatus(st) }}</sv-badge>
                        <svg [lucideIcon]="icons.chevronRight" [size]="16" class="text-ink-muted" />
                      </a>
                    </li>
                  } @empty {
                    <li class="px-5 py-6 text-center text-[13px] text-ink-muted">Nie masz jeszcze dostępu do żadnego sklepu.</li>
                  }
                </ul>
              }
            </div>
          </section>

          <!-- Sign out -->
          <section class="sv-card flex flex-wrap items-center gap-3 px-5 py-4">
            <span class="min-w-0 flex-1">
              <span class="block text-[13.5px] font-medium text-ink">Wyloguj się</span>
              <span class="block text-[12.5px] text-ink-muted">Zakończ sesję na tym urządzeniu.</span>
            </span>
            <button sv-button variant="secondary" size="sm" (click)="logout()"><svg [lucideIcon]="icons.logout" />Wyloguj</button>
          </section>
        </div>
      </div>

      @if (profile.dirty) {
        <div class="sticky bottom-5 z-20 mt-8 flex justify-center" role="region" aria-label="Niezapisane zmiany">
          <div class="flex items-center gap-3 rounded-full bg-night py-2 pl-5 pr-2 text-white shadow-[0_16px_40px_-12px_rgba(15,18,16,0.5)]">
            <span class="size-2 rounded-full bg-neon" aria-hidden="true"></span>
            <span class="text-[13.5px] font-medium">Niezapisane zmiany</span>
            <button type="button" class="h-9 rounded-full px-4 text-[13px] font-medium text-white/75 hover:bg-white/10 hover:text-white" (click)="resetProfile()">Odrzuć</button>
            <button sv-button variant="accent" size="sm" type="submit" form="profile-form" [loading]="savingProfile()" class="!h-9">Zapisz</button>
          </div>
        </div>
      }
    </main>
  `,
  styles: `
    .acc-h { font-size: 15px; font-weight: 600; color: var(--color-ink); }
    .acc-p { margin-top: 0.15rem; font-size: 13px; line-height: 1.55; color: var(--color-ink-soft); }
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionStore);
  private readonly api = inject(AccountApi);
  private readonly storesApi = inject(StoresApi);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly device = describeUserAgent;
  protected readonly icons = icons;
  protected readonly roleLabels = STORE_ROLE_LABELS;
  protected readonly sections: Section[] = [
    { id: 'profil', label: 'Profil', icon: 'user' },
    { id: 'bezpieczenstwo', label: 'Bezpieczeństwo', icon: 'shieldCheck' },
    { id: 'urzadzenia', label: 'Urządzenia', icon: 'monitor' },
    { id: 'sklepy', label: 'Twoje sklepy', icon: 'store' },
  ];
  protected readonly active = signal('profil');
  protected readonly passwordOpen = signal(false);
  protected readonly disableOpen = signal(false);
  protected readonly fullName = computed(() => `${this.session.user()?.firstName ?? ''} ${this.session.user()?.lastName ?? ''}`.trim());
  protected readonly stores = rxResource({ stream: () => this.storesApi.myStores() });
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

  /** Highlights the section whose heading has passed the top third of the screen. */
  protected onScroll(): void {
    let current = this.sections[0]!.id;
    for (const sec of this.sections) {
      const el = document.getElementById(sec.id);
      if (el && el.getBoundingClientRect().top < window.innerHeight / 3) current = sec.id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = this.sections.at(-1)!.id;
    this.active.set(current);
  }

  protected go(id: string): void {
    this.active.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected isMobile(ua: string | null): boolean {
    return !!ua && /Android|iPhone|iPad|Mobile/i.test(ua);
  }

  protected initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  }

  protected storeStatus(st: MyStore): string {
    if (st.tenantStatus === 'SUSPENDED') return 'Zawieszony';
    if (st.tenantStatus === 'CLOSED') return 'Zamknięty';
    return st.status === 'PUBLISHED' ? 'Opublikowany' : st.status === 'SUSPENDED' ? 'Wstrzymany' : 'Szkic';
  }

  protected resetProfile(): void {
    const u = this.session.user();
    this.profile.reset({ firstName: u?.firstName ?? '', lastName: u?.lastName ?? '' });
    this.profileMsg.set(null);
  }

  protected cancelPassword(): void {
    this.password.reset();
    this.passwordMsg.set(null);
    this.passwordOpen.set(false);
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
      this.resetProfile();
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
      this.cancelPassword();
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
      this.disableOpen.set(false);
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
