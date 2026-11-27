import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiError, ShippingApi } from '@shopivo/api-client';
import { CarrierAccount, CarrierDescriptor } from '@shopivo/shared-models';
import { LucideDynamicIcon } from '@lucide/angular';
import { AlertComponent, BadgeComponent, ButtonComponent, FieldComponent, LoadingComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface Draft { values: Record<string, string>; sandbox: boolean; }

/** The store's carrier accounts (e.g. InPost ShipX). Secrets are write-only; saved fields show as filled. */
@Component({
  selector: 'sv-carrier-accounts',
  imports: [FormsModule, LucideDynamicIcon, FieldComponent, ButtonComponent, AlertComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-7" aria-labelledby="carriers-h">
      <div class="mb-3">
        <h2 id="carriers-h" class="text-[14.5px] font-semibold text-ink">Przewoźnicy</h2>
        <p class="mt-0.5 text-[13px] text-ink-soft">Podłącz własne konto u przewoźnika, aby klienci wybierali paczkomat, a Ty tworzył(a) przesyłki i etykiety z zamówienia.</p>
      </div>
      @if (overview.isLoading() && !overview.value()) {
        <sv-loading variant="form" />
      } @else if (overview.error()) {
        <sv-alert tone="error">Nie udało się wczytać przewoźników.</sv-alert>
      } @else {
        <div class="sv-card overflow-hidden">
          @for (c of carriers(); track c.id) {
            @let acc = account(c.id);
            <button type="button" class="settings-item" [attr.aria-expanded]="openId() === c.id" [attr.aria-controls]="'carrier-' + c.id"
              (click)="openId.set(openId() === c.id ? null : c.id)">
              <svg [lucideIcon]="icons.shipping" [size]="17" class="shrink-0 text-ink-soft" />
              <span class="min-w-0 flex-1 text-left font-medium">{{ c.name }}</span>
              @if (acc?.sandbox) {<span class="settings-pill !bg-warning-soft !text-warning-ink">Sandbox</span>}
              <span class="settings-pill" [class.!bg-success-soft]="acc?.enabled" [class.!text-success-ink]="acc?.enabled">
                {{ !acc ? 'Niepołączony' : acc.enabled ? 'Włączony' : acc.verifiedAt ? 'Wyłączony' : 'Do sprawdzenia' }}</span>
              <svg [lucideIcon]="icons.chevronDown" [size]="16" class="text-ink-muted transition-transform" [class.rotate-180]="openId() === c.id" />
            </button>
            @if (openId() === c.id) {
            <form [id]="'carrier-' + c.id" class="border-b border-line bg-[#FAFAF8] px-5 pb-5 pt-1 last:border-b-0" (ngSubmit)="save(c)">
              <p class="mt-2 text-[12.5px] text-ink-muted">{{ c.description }}
                @if (c.docsUrl) {<a class="sv-link" [href]="c.docsUrl" target="_blank" rel="noopener">Dokumentacja</a>}</p>
              <fieldset class="mt-3 grid gap-3 sm:grid-cols-2" [disabled]="!canWrite">
                @for (f of c.credentials; track f.key) {
                  <sv-field [label]="f.label" [for]="c.id + '-' + f.key" [hint]="acc?.filled?.[f.key] && f.secret ? 'Zapisane — zostaw puste, aby nie zmieniać.' : (f.hint ?? '')">
                    <input [id]="c.id + '-' + f.key" [name]="c.id + '-' + f.key" class="sv-input" autocomplete="off" maxlength="1000"
                      [type]="f.secret ? 'password' : 'text'" [ngModel]="draft(c.id).values[f.key] ?? ''" (ngModelChange)="setValue(c.id, f.key, $event)" />
                  </sv-field>
                }
                <label class="flex items-center gap-2.5 text-[13px] text-ink sm:col-span-2">
                  <input type="checkbox" role="switch" class="sv-switch" [name]="c.id + '-sandbox'" [ngModel]="draft(c.id).sandbox" (ngModelChange)="setSandbox(c.id, $event)" />
                  Środowisko testowe (sandbox)
                </label>
              </fieldset>
              @if (errors()[c.id]; as e) {<sv-alert tone="error" class="mt-3">{{ e }}</sv-alert>}
              @if (canWrite) {
                <div class="mt-3 flex flex-wrap gap-2">
                  <button sv-button type="submit" variant="secondary" size="sm" [loading]="busy() === c.id + ':save'">Zapisz dane</button>
                  @if (acc) {
                    <button sv-button type="button" variant="secondary" size="sm" [loading]="busy() === c.id + ':test'" (click)="test(c)">Sprawdź połączenie</button>
                    @if (acc.enabled) {
                      <button sv-button type="button" variant="ghost" size="sm" [loading]="busy() === c.id + ':toggle'" (click)="toggle(c, false)">Wyłącz</button>
                    } @else {
                      <button sv-button type="button" size="sm" [disabled]="!acc.verifiedAt" [loading]="busy() === c.id + ':toggle'" (click)="toggle(c, true)">Włącz</button>
                    }
                  }
                </div>
              }
            </form>
            }
          }
        </div>
      }
    </section>
  `,
})
export class CarrierAccountsComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ShippingApi);
  private readonly toast = inject(ToastService);
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');
  protected readonly icons = icons;
  protected readonly openId = signal<string | null>(null);
  /** Emitted when the set of enabled carriers may have changed. */
  readonly changed = output<void>();

  protected readonly overview = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.carriers(params) });
  private readonly accounts = signal<Record<string, CarrierAccount>>({});
  private readonly drafts = signal<Record<string, Draft>>({});
  protected readonly busy = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string | null>>({});
  protected readonly carriers = computed(() => this.overview.value()?.carriers ?? []);

  protected account(id: string): CarrierAccount | null {
    return this.accounts()[id] ?? this.overview.value()?.accounts.find((a) => a.carrierId === id) ?? null;
  }

  protected draft(id: string): Draft {
    return this.drafts()[id] ?? { values: {}, sandbox: this.account(id)?.sandbox ?? true };
  }

  protected setValue(id: string, key: string, value: string): void {
    const d = this.draft(id);
    this.drafts.update((all) => ({ ...all, [id]: { ...d, values: { ...d.values, [key]: value } } }));
  }

  protected setSandbox(id: string, sandbox: boolean): void {
    this.drafts.update((all) => ({ ...all, [id]: { ...this.draft(id), sandbox } }));
  }

  protected async save(c: CarrierDescriptor): Promise<void> {
    const d = this.draft(c.id);
    await this.run(c.id, 'save', async () => {
      const acc = await firstValueFrom(this.api.saveCarrier(this.ctx.tenantId(), c.id, { credentials: d.values, sandbox: d.sandbox,
        version: this.account(c.id)?.version ?? -1 }));
      this.accounts.update((all) => ({ ...all, [c.id]: acc }));
      this.drafts.update((all) => ({ ...all, [c.id]: { values: {}, sandbox: acc.sandbox } }));
      this.toast.success(`Zapisano dane: ${c.name}. Sprawdź połączenie, aby włączyć.`);
    });
  }

  protected async test(c: CarrierDescriptor): Promise<void> {
    await this.run(c.id, 'test', async () => {
      const acc = await firstValueFrom(this.api.testCarrier(this.ctx.tenantId(), c.id));
      this.accounts.update((all) => ({ ...all, [c.id]: acc }));
      this.toast.success(`Połączenie z ${c.name} działa.`);
    });
  }

  protected async toggle(c: CarrierDescriptor, enabled: boolean): Promise<void> {
    await this.run(c.id, 'toggle', async () => {
      const acc = await firstValueFrom(this.api.enableCarrier(this.ctx.tenantId(), c.id, enabled));
      this.accounts.update((all) => ({ ...all, [c.id]: acc }));
      this.toast.success(enabled ? `${c.name} jest włączony.` : `${c.name} jest wyłączony.`);
      this.changed.emit();
    });
  }

  private async run(id: string, kind: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(id + ':' + kind);
    this.errors.update((e) => ({ ...e, [id]: null }));
    try {
      await action();
    } catch (e) {
      this.errors.update((all) => ({ ...all, [id]: ApiError.from(e).message }));
    } finally {
      this.busy.set(null);
    }
  }

  /** Display name of a carrier (falls back to its id). */
  nameOf(id: string): string {
    return this.carriers().find((c) => c.id === id)?.name ?? id;
  }

  /** Enabled carriers that support a shipping type (for linking methods). */
  enabledFor(type: string): { id: string; name: string }[] {
    return this.carriers().filter((c) => c.services.includes(type as never) && this.account(c.id)?.enabled).map((c) => ({ id: c.id, name: c.name }));
  }
}
