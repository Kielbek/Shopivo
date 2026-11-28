import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiError, GoogleSignInApi, GoogleSignInSettings } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, ToastService } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

/**
 * "Zaloguj się przez Google" in the store, with the merchant's own Google OAuth client. The secret is write-only
 * (stored encrypted, never shown); the button appears in the store only when the keys are saved and switched on.
 */
@Component({
  selector: 'sv-google-sign-in',
  imports: [FormsModule, FieldComponent, ButtonComponent, AlertComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-7" aria-labelledby="google-h">
      <h2 id="google-h" class="text-[14.5px] font-semibold text-ink">Logowanie klientów przez Google</h2>
      <p class="mt-0.5 max-w-2xl text-[13px] text-ink-soft">Przycisk „Zaloguj się przez Google” na stronach logowania i rejestracji Twojego sklepu.
        Używa Twojego własnego projektu w Google Cloud — klienci widzą nazwę Twojego sklepu, a dane logowania trafiają tylko do Ciebie.</p>

      @if (settings.isLoading() && !settings.value()) {
        <div class="mt-3"><sv-loading variant="form" /></div>
      } @else if (settings.error()) {
        <sv-alert tone="error" class="mt-3">Nie udało się wczytać ustawień logowania przez Google.</sv-alert>
      } @else if (settings.value(); as s) {
        <div class="sv-card mt-3 p-5">
          <div class="flex flex-wrap items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 48 48" width="28" height="28"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.82 7.18l7.73 6C44.36 38.04 46.98 31.9 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59a14.41 14.41 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6C30.02 37.64 27.25 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            <p class="flex-1 text-[14px] font-semibold text-ink">Google
              <span class="settings-pill ml-1" [class]="s.enabled ? '!bg-success-soft !text-success-ink' : ''">{{ s.enabled ? 'Włączone w sklepie' : s.secretSet ? 'Wyłączone' : 'Nie skonfigurowano' }}</span></p>
          </div>

          <details class="mt-4 rounded-[10px] border border-line px-4 py-3 text-[13px] text-ink-soft" [open]="!s.secretSet">
            <summary class="cursor-pointer font-semibold text-ink">Jak zdobyć klucze (ok. 5 minut)</summary>
            <ol class="mt-3 list-decimal space-y-1.5 pl-5">
              <li>Otwórz <a class="font-semibold text-primary-strong underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console → Dane logowania</a> i utwórz projekt (np. nazwa sklepu).</li>
              <li>Skonfiguruj „Ekran zgody OAuth”: typ <b>Zewnętrzny</b>, nazwa sklepu, Twój e-mail, zakresy <b>email</b>, <b>profile</b>, <b>openid</b>. Opublikuj aplikację (status „W produkcji”).</li>
              <li>„Utwórz dane logowania” → <b>Identyfikator klienta OAuth</b> → typ <b>Aplikacja internetowa</b>.</li>
              <li>W polu „Autoryzowane identyfikatory URI przekierowania” wklej:
                <ul class="mt-1.5 space-y-1">
                  @for (u of s.redirectUris; track u) {
                    <li class="flex flex-wrap items-center gap-2"><code class="rounded bg-canvas px-1.5 py-0.5 text-[12px] text-ink">{{ u }}</code>
                      <button type="button" class="text-[12px] font-semibold text-primary-strong hover:underline" (click)="copy(u)">Kopiuj</button></li>
                  } @empty {<li class="text-ink-muted">Najpierw opublikuj sklep — adres powstanie razem z domeną.</li>}
                </ul>
              </li>
              <li>Skopiuj <b>Identyfikator klienta</b> i <b>Tajny klucz klienta</b> do pól poniżej i włącz logowanie.</li>
            </ol>
          </details>

          <form class="mt-4 grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
            <fieldset class="contents" [disabled]="!canWrite">
              <sv-field label="Identyfikator klienta (Client ID)" for="g-client" hint="Kończy się na „.apps.googleusercontent.com”.">
                <input id="g-client" name="clientId" class="sv-input" autocomplete="off" maxlength="200" [ngModel]="clientId()" (ngModelChange)="clientId.set($event)" />
              </sv-field>
              <sv-field label="Tajny klucz klienta (Client secret)" for="g-secret" [hint]="s.secretSet ? 'Zapisany — zostaw puste, aby nie zmieniać.' : 'Zapisujemy go zaszyfrowany i nigdy nie pokazujemy.'">
                <input id="g-secret" name="clientSecret" type="password" class="sv-input" autocomplete="new-password" maxlength="200"
                  [placeholder]="s.secretSet ? '••••••••••••' : ''" [ngModel]="secret()" (ngModelChange)="secret.set($event)" />
              </sv-field>
              <label class="flex items-center gap-2.5 text-[13px] text-ink sm:col-span-2">
                <input type="checkbox" role="switch" class="sv-switch" name="enabled" [ngModel]="enabled()" (ngModelChange)="enabled.set($event)" />
                Pokaż przycisk „Zaloguj się przez Google” w sklepie
              </label>
            </fieldset>
            @if (error(); as e) {<sv-alert tone="error" class="sm:col-span-2">{{ e }}</sv-alert>}
            @if (canWrite) {
              <div class="flex flex-wrap gap-2 sm:col-span-2">
                <button sv-button type="submit" [loading]="busy() === 'save'">Zapisz</button>
                @if (s.secretSet) {<button sv-button type="button" variant="ghost" class="text-danger-ink" [loading]="busy() === 'remove'" (click)="remove()">Usuń klucze</button>}
              </div>
            }
          </form>
          <p class="mt-3 text-[12px] text-ink-muted">Konta klientów z Google i z hasłem to te same konta — łączymy je po potwierdzonym adresie e-mail. Po usunięciu kluczy klienci logują się hasłem (mogą je ustawić przez „Nie pamiętasz hasła?”).</p>
        </div>
      }
    </section>
  `,
})
export class GoogleSignInComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(GoogleSignInApi);
  private readonly toast = inject(ToastService);
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');
  protected readonly settings = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.get(params) });
  protected readonly clientId = signal('');
  protected readonly secret = signal('');
  protected readonly enabled = signal(false);
  protected readonly busy = signal<'save' | 'remove' | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const s = this.settings.value();
      if (s) this.fill(s);
    });
  }

  private fill(s: GoogleSignInSettings): void {
    this.clientId.set(s.clientId);
    this.enabled.set(s.enabled);
    this.secret.set('');
  }

  protected async save(): Promise<void> {
    const s = this.settings.value();
    if (!s) return;
    this.busy.set('save');
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.save(this.ctx.tenantId(), { clientId: this.clientId().trim(), clientSecret: this.secret(), enabled: this.enabled(), version: s.version }));
      this.settings.set(saved);
      this.toast.success(saved.enabled ? 'Zapisano — przycisk Google jest w sklepie.' : 'Zapisano klucze. Przycisk pojawi się po włączeniu.');
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }

  protected async remove(): Promise<void> {
    this.busy.set('remove');
    try {
      await firstValueFrom(this.api.remove(this.ctx.tenantId()));
      this.settings.reload();
      this.toast.success('Usunięto klucze Google. Przycisk zniknął ze sklepu.');
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }

  protected copy(text: string): void {
    void navigator.clipboard?.writeText(text).then(() => this.toast.success('Skopiowano adres.'));
  }
}
