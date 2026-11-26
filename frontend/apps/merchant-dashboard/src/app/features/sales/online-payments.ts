import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiError, OnlinePaymentsApi } from '@shopivo/api-client';
import { OnlinePaymentsState } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, FieldComponent, LoadingComponent, SectionComponent, SelectComponent, SelectOption, ToastService,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

/**
 * The store's own payment operator account: money goes straight to the merchant. Secrets are write-only — the API
 * reports only which fields are filled, so the form leaves saved secrets blank.
 */
@Component({
  selector: 'sv-online-payments',
  imports: [FormsModule, SectionComponent, FieldComponent, ButtonComponent, AlertComponent, LoadingComponent, BadgeComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-section class="mt-6" title="Płatności online"
      description="BLIK, karty i szybkie przelewy przez Twoje konto u operatora. Pieniądze trafiają bezpośrednio do Ciebie — Shopivo ich nie pośredniczy.">
      @if (overview.isLoading() && !overview.value()) {
        <sv-loading variant="form" />
      } @else if (overview.error()) {
        <sv-alert tone="error">Nie udało się wczytać ustawień płatności online.</sv-alert>
      } @else {
        @if (state(); as s) {
          <div class="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span class="font-medium text-ink">{{ s.providerName }}</span>
            <sv-badge [tone]="s.enabled ? 'success' : 'neutral'">{{ s.enabled ? 'Włączone w sklepie' : 'Wyłączone' }}</sv-badge>
            @if (s.sandbox) {<sv-badge tone="warning">Tryb testowy (sandbox)</sv-badge>}
            <span class="text-ink-muted">{{ s.verifiedAt ? 'Połączenie sprawdzone' : 'Połączenie niesprawdzone' }}</span>
          </div>
        }
        <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
          <fieldset class="contents" [disabled]="!canWrite">
            <sv-field label="Operator" for="op" class="sm:col-span-2">
              <sv-select inputId="op" ariaLabel="Operator płatności" [options]="operatorOptions()" [(value)]="operatorId" placeholder="Wybierz operatora…" />
            </sv-field>
            @if (operator(); as op) {
              <p class="text-[12px] text-ink-muted sm:col-span-2">{{ op.description }}
                @if (op.docsUrl) {<a class="sv-link" [href]="op.docsUrl" target="_blank" rel="noopener">Gdzie znaleźć dane?</a>}</p>
              @for (f of op.credentials; track f.key) {
                <sv-field [label]="f.label" [for]="'cred-' + f.key" [hint]="hint(f.key, f.secret, f.hint)">
                  <input [id]="'cred-' + f.key" [name]="'cred-' + f.key" class="sv-input" autocomplete="off" maxlength="500"
                    [type]="f.secret ? 'password' : 'text'" [ngModel]="values()[f.key] ?? ''" (ngModelChange)="setValue(f.key, $event)" />
                </sv-field>
              }
              <label class="flex items-center gap-2.5 text-[13px] text-ink sm:col-span-2">
                <input type="checkbox" role="switch" class="sv-switch" name="sandbox" [ngModel]="sandbox()" (ngModelChange)="sandbox.set($event)" />
                Tryb testowy (sandbox) — płatności nie są prawdziwe
              </label>
            }
          </fieldset>
          @if (error(); as e) {<sv-alert tone="error" class="sm:col-span-2">{{ e }}</sv-alert>}
          @if (canWrite) {
            <div class="flex flex-wrap gap-2 sm:col-span-2">
              <button sv-button type="submit" variant="secondary" [disabled]="!operatorId()" [loading]="busy() === 'save'">Zapisz dane</button>
              @if (state(); as s) {
                <button sv-button type="button" variant="secondary" [loading]="busy() === 'test'" (click)="test()">Sprawdź połączenie</button>
                @if (s.enabled) {
                  <button sv-button type="button" variant="ghost" [loading]="busy() === 'toggle'" (click)="toggle(false)">Wyłącz w sklepie</button>
                } @else {
                  <button sv-button type="button" [disabled]="!s.verifiedAt" [loading]="busy() === 'toggle'" (click)="toggle(true)">Włącz w sklepie</button>
                }
              }
            </div>
            <p class="text-[12px] text-ink-muted sm:col-span-2">Po każdej zmianie danych sprawdź połączenie i włącz płatności ponownie. Adres powiadomień
              przekazujemy operatorowi automatycznie przy każdej płatności. Zwroty wykonujesz w panelu operatora, a w zamówieniu oznaczasz „Zwrócono”.</p>
          }
        </form>
      }
    </sv-section>
  `,
})
export class OnlinePaymentsComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(OnlinePaymentsApi);
  private readonly toast = inject(ToastService);
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');

  protected readonly overview = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.overview(params) });
  protected readonly state = signal<OnlinePaymentsState | null>(null);
  protected readonly operatorId = signal<string | null>(null);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly sandbox = signal(true);
  protected readonly busy = signal<'save' | 'test' | 'toggle' | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly operatorOptions = computed<SelectOption[]>(() =>
    (this.overview.value()?.operators ?? []).map((o) => ({ value: o.id, label: o.name })));
  protected readonly operator = computed(() => this.overview.value()?.operators.find((o) => o.id === this.operatorId()) ?? null);

  constructor() {
    effect(() => {
      const o = this.overview.hasValue() ? this.overview.value() : null;
      if (!o) return;
      this.state.set(o.current);
      if (o.current) {
        this.operatorId.set(o.current.providerId);
        this.sandbox.set(o.current.sandbox);
      }
    });
  }

  protected hint(key: string, secret: boolean, hint: string | null): string {
    const s = this.state();
    if (secret && s && s.providerId === this.operatorId() && s.filled[key]) return 'Zapisane — zostaw puste, aby nie zmieniać.';
    return hint ?? '';
  }

  protected setValue(key: string, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  protected async save(): Promise<void> {
    const id = this.operatorId();
    if (!id) return;
    await this.run('save', async () => {
      const s = await firstValueFrom(this.api.save(this.ctx.tenantId(), { providerId: id, credentials: this.values(), sandbox: this.sandbox(),
        version: this.state()?.version ?? -1 }));
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

  private async run(kind: 'save' | 'test' | 'toggle', action: () => Promise<void>): Promise<void> {
    this.busy.set(kind);
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}
