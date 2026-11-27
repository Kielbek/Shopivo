import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, OnlinePaymentsApi } from '@shopivo/api-client';
import { OnlinePaymentsState, OperatorDescriptor, StripeConnectStatus } from '@shopivo/shared-models';
import { AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { BrandLogoComponent } from './brand-logo';

/**
 * Online payments: one operator per store. Stripe connects through Shopivo's Stripe Connect platform (hosted onboarding,
 * no keys); Przelewy24 / PayU / Tpay use the merchant's own account keys (write-only — the API only says which are set).
 */
@Component({
  selector: 'sv-online-payments',
  imports: [FormsModule, LucideDynamicIcon, FieldComponent, ButtonComponent, AlertComponent, LoadingComponent, BrandLogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-7" aria-labelledby="online-pay-h">
      <h2 id="online-pay-h" class="text-[14.5px] font-semibold text-ink">Płatności online</h2>
      <p class="mt-0.5 max-w-2xl text-[13px] text-ink-soft">BLIK, karty i szybkie przelewy. Pieniądze trafiają prosto na Twoje konto u operatora —
        Shopivo ich nie przechowuje. Sklep ma jednego operatora; wybór innego zastępuje poprzedniego.</p>

      @if (overview.isLoading() && !overview.value()) {
        <div class="mt-3"><sv-loading variant="form" /></div>
      } @else if (overview.error()) {
        <sv-alert tone="error" class="mt-3">Nie udało się wczytać ustawień płatności online.</sv-alert>
      } @else {
        <!-- Current operator -->
        @if (state(); as s) {
          <div class="sv-card mt-3 flex flex-wrap items-center gap-4 px-5 py-4">
            <sv-brand-logo [brand]="s.providerId" [name]="s.providerName" class="h-11 w-24" />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">{{ s.providerName }}
                <span class="settings-pill" [class]="s.enabled ? '!bg-success-soft !text-success-ink' : ''">{{ statusLabel(s) }}</span>
                @if (s.sandbox) {<span class="settings-pill !bg-warning-soft !text-warning-ink">Tryb testowy</span>}
              </p>
              <p class="mt-0.5 text-[12.5px] text-ink-muted">{{ statusHint(s) }}</p>
            </div>
            @if (canWrite) {
              @if (s.enabled) {
                <button sv-button variant="secondary" size="sm" [loading]="busy() === 'toggle'" (click)="toggle(false)">Wyłącz w sklepie</button>
              } @else if (s.verifiedAt) {
                <button sv-button variant="accent" size="sm" [loading]="busy() === 'toggle'" (click)="toggle(true)">Włącz w sklepie</button>
              } @else if (s.providerId === 'stripe') {
                <button sv-button size="sm" [loading]="busy() === 'stripe'" (click)="connectStripe()">Dokończ w Stripe</button>
              }
            }
          </div>
        }
        @if (error(); as e) {<sv-alert tone="error" class="mt-3">{{ e }}</sv-alert>}

        <!-- Operators -->
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          @for (op of operators(); track op.id) {
            @let current = state()?.providerId === op.id;
            <article class="sv-card relative flex flex-col p-5" [class.ring-2]="selected() === op.id" [class.ring-ink]="selected() === op.id">
              <div class="flex items-start gap-3">
                <sv-brand-logo [brand]="op.id" [name]="op.name" class="h-11 w-24" />
                <div class="min-w-0 flex-1">
                  <h3 class="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">{{ op.name }}
                    @if (op.id === 'stripe') {<span class="settings-pill !bg-neon-soft !text-[#2E6B0F]">Polecane</span>}
                    @if (current) {<span class="settings-pill">Twój operator</span>}
                  </h3>
                  <p class="mt-1 text-[12.5px] leading-5 text-ink-soft">{{ op.description }}</p>
                </div>
              </div>
              @if (op.id === 'stripe') {
                <div class="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Metody płatności przez Stripe">
                  <sv-brand-logo brand="blik" class="h-7 w-12" />
                  <sv-brand-logo brand="przelewy24" class="h-7 w-16" />
                  @for (m of ['Karty', 'Apple Pay', 'Google Pay']; track m) {<span class="settings-pill">{{ m }}</span>}
                </div>
              }
              <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                @if (op.connect) {
                  @if (!op.available) {
                    <p class="text-[12.5px] text-ink-muted">Wymaga włączenia Stripe Connect na platformie Shopivo (klucz platformy po stronie serwera).</p>
                  } @else if (canWrite) {
                    <button sv-button size="sm" [variant]="current ? 'secondary' : 'primary'" [loading]="busy() === 'stripe'" (click)="connectStripe()">
                      {{ current ? (stripe()?.chargesEnabled ? 'Ustawienia konta w Stripe' : 'Dokończ zakładanie konta') : 'Połącz ze Stripe' }}
                      <svg [lucideIcon]="icons.external" /></button>
                    @if (current) {
                      <button sv-button variant="ghost" size="sm" [loading]="busy() === 'refresh'" (click)="refreshStripe()">Sprawdź status</button>
                    }
                    <span class="text-[12px] text-ink-muted">Konto zakładasz w kreatorze Stripe — bez kluczy API.</span>
                  }
                } @else if (canWrite) {
                  <button sv-button size="sm" variant="secondary" (click)="select(op)">{{ current ? 'Zmień dane' : 'Połącz' }}</button>
                  @if (op.docsUrl) {<a class="text-[12.5px] text-ink-muted hover:text-ink" [href]="op.docsUrl" target="_blank" rel="noopener">Dokumentacja ↗</a>}
                }
              </div>
            </article>
          }
        </div>

        <!-- Keys form for operators with the merchant's own account -->
        @if (selectedOperator(); as op) {
          <form class="sv-card mt-3 p-5" (ngSubmit)="save()" aria-labelledby="keys-h">
            <div class="flex items-center gap-3">
              <sv-brand-logo [brand]="op.id" [name]="op.name" class="h-9 w-20" />
              <h3 id="keys-h" class="flex-1 text-[14px] font-semibold text-ink">Dane konta {{ op.name }}</h3>
              <button type="button" class="text-[13px] text-ink-muted hover:text-ink" (click)="selected.set(null)">Zamknij</button>
            </div>
            @if (state() && state()!.providerId !== op.id) {
              <sv-alert tone="warning" class="mt-3">Zapisanie zastąpi obecnego operatora ({{ state()!.providerName }}). Płatności będą wyłączone do czasu sprawdzenia połączenia.</sv-alert>
            }
            <fieldset class="mt-4 grid gap-4 sm:grid-cols-2" [disabled]="!canWrite">
              @for (f of op.credentials; track f.key) {
                <sv-field [label]="f.label" [for]="'cred-' + f.key" [hint]="hint(op.id, f.key, f.secret, f.hint)">
                  <input [id]="'cred-' + f.key" [name]="'cred-' + f.key" class="sv-input" autocomplete="off" maxlength="500"
                    [type]="f.secret ? 'password' : 'text'" [ngModel]="values()[f.key] ?? ''" (ngModelChange)="setValue(f.key, $event)" />
                </sv-field>
              }
              <label class="flex items-center gap-2.5 text-[13px] text-ink sm:col-span-2">
                <input type="checkbox" role="switch" class="sv-switch" name="sandbox" [ngModel]="sandbox()" (ngModelChange)="sandbox.set($event)" />
                Tryb testowy (sandbox) — płatności nie są prawdziwe
              </label>
            </fieldset>
            <div class="mt-4 flex flex-wrap gap-2">
              <button sv-button type="submit" [loading]="busy() === 'save'">Zapisz dane</button>
              @if (state()?.providerId === op.id) {
                <button sv-button type="button" variant="secondary" [loading]="busy() === 'test'" (click)="test()">Sprawdź połączenie</button>
              }
            </div>
            <p class="mt-3 text-[12px] text-ink-muted">Klucze zapisujemy zaszyfrowane i nigdy ich nie pokazujemy. Adres powiadomień przekazujemy operatorowi automatycznie.
              Zwroty wykonujesz w panelu operatora, a w zamówieniu oznaczasz „Zwrócono”.</p>
          </form>
        }
      }
    </section>
  `,
})
export class OnlinePaymentsComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(OnlinePaymentsApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');

  /** `?stripe=powrot|odswiez` after Stripe's onboarding (set by the payments page). */
  readonly stripeReturn = input<string | null>(null);

  protected readonly overview = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.overview(params) });
  protected readonly stripe = signal<StripeConnectStatus | null>(null);
  protected readonly state = signal<OnlinePaymentsState | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly sandbox = signal(true);
  protected readonly busy = signal<'save' | 'test' | 'toggle' | 'stripe' | 'refresh' | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Stripe first (recommended), the dev simulator last. */
  protected readonly operators = computed<OperatorDescriptor[]>(() => [...(this.overview.value()?.operators ?? [])]
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name)));
  protected readonly selectedOperator = computed(() => this.operators().find((o) => o.id === this.selected() && !o.connect) ?? null);

  constructor() {
    effect(() => {
      const o = this.overview.hasValue() ? this.overview.value() : null;
      if (!o) return;
      untracked(() => {
        this.state.set(o.current);
        if (o.current) this.sandbox.set(o.current.sandbox);
      });
    });
    effect(() => {
      const t = this.ctx.tenantId();
      untracked(() => void firstValueFrom(this.api.stripeStatus(t)).then((s) => this.stripe.set(s)).catch(() => undefined));
    });
    // Back from Stripe: read the account status; an expired link (refresh_url) is renewed straight away.
    effect(() => {
      const r = this.stripeReturn();
      if (!r) return;
      untracked(() => (r === 'odswiez' ? void this.connectStripe() : void this.refreshStripe(true)));
    });
  }

  protected statusLabel(s: OnlinePaymentsState): string {
    if (s.enabled) return 'Włączone w sklepie';
    if (s.verifiedAt) return 'Gotowe do włączenia';
    return s.providerId === 'stripe' ? 'Weryfikacja w Stripe' : 'Połączenie niesprawdzone';
  }

  protected statusHint(s: OnlinePaymentsState): string {
    if (s.enabled) return 'Klienci płacą online przy zamówieniu.';
    if (s.providerId === 'stripe') {
      const st = this.stripe();
      if (s.verifiedAt) return 'Stripe zweryfikował konto — włącz płatności w sklepie.';
      if (st?.detailsSubmitted) return 'Stripe sprawdza przesłane dane. Zwykle trwa to od kilku minut do dwóch dni roboczych.';
      return 'Dokończ zakładanie konta w kreatorze Stripe (dane firmy i rachunek do wypłat).';
    }
    return s.verifiedAt ? 'Połączenie działa — włącz płatności w sklepie.' : 'Sprawdź połączenie, aby włączyć płatności.';
  }

  protected select(op: OperatorDescriptor): void {
    this.values.set({});
    this.error.set(null);
    this.sandbox.set(this.state()?.providerId === op.id ? this.state()!.sandbox : true);
    this.selected.set(this.selected() === op.id ? null : op.id);
  }

  protected hint(id: string, key: string, secret: boolean, hint: string | null): string {
    const s = this.state();
    if (secret && s && s.providerId === id && s.filled[key]) return 'Zapisane — zostaw puste, aby nie zmieniać.';
    return hint ?? '';
  }

  protected setValue(key: string, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  protected async connectStripe(): Promise<void> {
    await this.run('stripe', async () => {
      const { url } = await firstValueFrom(this.api.stripeConnect(this.ctx.tenantId()));
      // Only ever leave for Stripe's own onboarding host.
      if (!/^https:\/\/connect\.stripe\.com\//.test(url)) throw new Error('Nieoczekiwany adres kreatora Stripe.');
      window.location.assign(url);
    });
  }

  protected async refreshStripe(fromReturn = false): Promise<void> {
    await this.run('refresh', async () => {
      const s = await firstValueFrom(this.api.stripeRefresh(this.ctx.tenantId()));
      this.stripe.set(s);
      this.overview.reload();
      if (fromReturn) {
        this.toast.success(s.chargesEnabled ? 'Konto Stripe jest gotowe — możesz włączyć płatności.' : 'Dane przekazane do Stripe. Damy znać, gdy konto zostanie zweryfikowane.');
      }
    });
  }

  protected async save(): Promise<void> {
    const op = this.selectedOperator();
    if (!op) return;
    await this.run('save', async () => {
      const current = this.state();
      const s = await firstValueFrom(this.api.save(this.ctx.tenantId(), { providerId: op.id, credentials: this.values(), sandbox: this.sandbox(),
        version: current?.version ?? -1 }));
      this.state.set(s);
      this.values.set({});
      this.toast.success('Zapisano dane operatora. Sprawdź połączenie, aby włączyć płatności.');
    });
  }

  protected async test(): Promise<void> {
    await this.run('test', async () => {
      this.state.set(await firstValueFrom(this.api.test(this.ctx.tenantId())));
      this.toast.success('Połączenie z operatorem działa.');
    });
  }

  protected async toggle(enabled: boolean): Promise<void> {
    await this.run('toggle', async () => {
      this.state.set(await firstValueFrom(this.api.setEnabled(this.ctx.tenantId(), enabled)));
      this.toast.success(enabled ? 'Płatności online są włączone w sklepie.' : 'Płatności online są wyłączone.');
    });
  }

  private async run(kind: 'save' | 'test' | 'toggle' | 'stripe' | 'refresh', action: () => Promise<void>): Promise<void> {
    this.busy.set(kind);
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(e instanceof Error && !(e as { status?: number }).status ? e.message : ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}

function rank(id: string): number {
  return id === 'stripe' ? 0 : id === 'fake' ? 9 : 1;
}
