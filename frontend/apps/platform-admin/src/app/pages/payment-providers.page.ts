import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { AdminBillingApi, ApiError, SessionStore } from '@shopivo/api-client';
import { PaymentProvider } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, FieldComponent, LoadingComponent,
  PageHeaderComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

interface Draft {
  enabled: boolean;
  sandbox: boolean;
  credentials: Record<string, string>;
}

/**
 * Payment operator used to collect subscription payments (Przelewy24, PayU, Tpay). Credentials are stored encrypted;
 * secrets are never sent back to the browser — an empty secret field keeps the saved value.
 */
@Component({
  selector: 'sv-admin-payment-providers',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    FieldComponent, LoadingComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Operatorzy płatności"
      description="Operator, przez którego sklepy płacą za subskrypcje Shopivo. Dane dostępowe są szyfrowane; sekrety nie są nigdy wyświetlane." />

    @if (!isAdmin) {
      <sv-alert tone="info" class="mt-6">Zmiany może wprowadzać tylko administrator platformy.</sv-alert>
    }

    @if (providers.isLoading() && !providers.value()) {
      <sv-loading />
    } @else if (providers.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać operatorów.</sv-alert>
    } @else {
      <div class="mt-6 grid gap-4 xl:grid-cols-2">
        @for (p of providers.value(); track p.id) {
          @let d = drafts()[p.id];
          <sv-card [heading]="p.name" [subheading]="p.description">
            <div card-actions class="flex items-center gap-1.5">
              @if (p.active) {<sv-badge tone="success">Używany do subskrypcji</sv-badge>}
              @if (p.enabled) {<sv-badge tone="info">{{ p.sandbox ? 'Sandbox' : 'Produkcja' }}</sv-badge>}
              @else {<sv-badge>Wyłączony</sv-badge>}
            </div>
            @if (d) {
              <form class="space-y-4" (ngSubmit)="save(p)">
                <div class="flex flex-wrap gap-x-6 gap-y-3">
                  <label class="flex items-center gap-2.5 text-[13px] text-ink">
                    <input type="checkbox" role="switch" class="sv-switch" [name]="p.id + '-enabled'" [(ngModel)]="d.enabled" [disabled]="!isAdmin" />
                    Włączony
                  </label>
                  <label class="flex items-center gap-2.5 text-[13px] text-ink">
                    <input type="checkbox" role="switch" class="sv-switch" [name]="p.id + '-sandbox'" [(ngModel)]="d.sandbox" [disabled]="!isAdmin" />
                    Tryb testowy (sandbox)
                  </label>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  @for (f of p.fields; track f.key) {
                    <sv-field [label]="f.label" [for]="p.id + '-' + f.key" [hint]="f.hint ?? undefined">
                      <input class="sv-input" [id]="p.id + '-' + f.key" [name]="p.id + '-' + f.key" [type]="f.secret ? 'password' : 'text'"
                        autocomplete="off" [disabled]="!isAdmin" [(ngModel)]="d.credentials[f.key]"
                        [placeholder]="f.secret && f.configured ? '•••••• zapisany — wpisz, aby zmienić' : ''" />
                    </sv-field>
                  }
                </div>
                @if (p.lastTestAt) {
                  <p class="flex items-center gap-1.5 text-[12px]" [class]="p.lastTestOk ? 'text-success-ink' : 'text-danger-ink'">
                    <svg [lucideIcon]="p.lastTestOk ? icons.success : icons.alert" [size]="14" />
                    {{ p.lastTestOk ? 'Połączenie działa' : 'Test połączenia nieudany' }} · {{ p.lastTestAt | svDate }}
                  </p>
                }
                @if (isAdmin) {
                  <div class="flex flex-wrap gap-2 border-t border-line pt-4">
                    <button sv-button type="submit" size="sm" [loading]="busy() === p.id + ':save'">Zapisz</button>
                    <button sv-button type="button" size="sm" variant="secondary" [loading]="busy() === p.id + ':test'"
                      [disabled]="!p.enabled" (click)="test(p)">Sprawdź połączenie</button>
                    @if (!p.active) {
                      <button sv-button type="button" size="sm" variant="secondary" [loading]="busy() === p.id + ':activate'"
                        [disabled]="!p.enabled" (click)="activate(p)">Używaj do subskrypcji</button>
                    }
                    @if (p.docsUrl) {
                      <a sv-button variant="ghost" size="sm" [href]="p.docsUrl" target="_blank" rel="noopener noreferrer">Dokumentacja</a>
                    }
                  </div>
                }
              </form>
            }
          </sv-card>
        }
      </div>
      <p class="mt-4 text-[12px] text-ink-muted">
        Adres powiadomień dla operatora jest ustawiany automatycznie przy każdej płatności
        (<code>/api/v1/webhooks/billing/&lt;operator&gt;</code> w domenie API platformy).
        Sprzedawcy podłączą własnych operatorów dla swoich klientów w module płatności sklepu.
      </p>
    }
  `,
})
export class PaymentProvidersPage {
  private readonly api = inject(AdminBillingApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly isAdmin = inject(SessionStore).user()?.platformRole === 'PLATFORM_ADMIN';

  protected readonly drafts = signal<Record<string, Draft>>({});
  protected readonly busy = signal<string | null>(null);

  protected readonly providers = rxResource({ stream: () => this.api.providers() });

  constructor() {
    // Editable drafts are rebuilt whenever the list (re)loads.
    effect(() => {
      const list = this.providers.value();
      if (list) this.resetDrafts(list);
    });
  }

  private resetDrafts(list: PaymentProvider[]): void {
    const next: Record<string, Draft> = {};
    for (const p of list) {
      next[p.id] = {
        enabled: p.enabled,
        sandbox: p.sandbox,
        credentials: Object.fromEntries(p.fields.map((f) => [f.key, f.secret ? '' : (f.value ?? '')])),
      };
    }
    this.drafts.set(next);
  }

  protected async save(p: PaymentProvider): Promise<void> {
    const d = this.drafts()[p.id];
    await this.run(p.id + ':save', () => this.api.saveProvider(p.id, d.enabled, d.sandbox, d.credentials), 'Zapisano konfigurację.');
  }

  protected async test(p: PaymentProvider): Promise<void> {
    await this.run(p.id + ':test', () => this.api.testProvider(p.id), null, (r) =>
      r.lastTestOk ? this.toast.success(`${p.name}: połączenie działa.`) : this.toast.error(`${p.name}: operator odrzucił dane dostępowe.`));
  }

  protected async activate(p: PaymentProvider): Promise<void> {
    await this.run(p.id + ':activate', () => this.api.activateProvider(p.id), `${p.name} obsługuje teraz płatności za subskrypcje.`);
  }

  private async run(key: string, action: () => import('rxjs').Observable<PaymentProvider>, success: string | null,
    after?: (r: PaymentProvider) => void): Promise<void> {
    this.busy.set(key);
    try {
      const result = await firstValueFrom(action());
      if (success) this.toast.success(success);
      after?.(result);
      this.providers.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}
