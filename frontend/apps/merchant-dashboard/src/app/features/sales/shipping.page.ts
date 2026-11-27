import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, OrdersApi, ShippingApi } from '@shopivo/api-client';
import { SHIPPING_TYPE_LABELS, ShippingMethod, ShippingType } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent, FieldComponent, LoadingComponent,
  MoneyPipe, PageHeaderComponent, SelectComponent, SelectOption, ToastService, icons, moneyInput, parseMoney,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface Form { id: string | null; name: string; description: string; type: ShippingType; price: string; freeFrom: string; active: boolean; version: number; carrier: string; }

@Component({
  selector: 'sv-shipping-page',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, ButtonComponent, AlertComponent,
    LoadingComponent, DialogComponent, FieldComponent, SelectComponent, MoneyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Wysyłka i dostawa" description="Sposoby dostawy, które klient widzi przy zamówieniu." />

    <section class="mt-7" aria-labelledby="ship-methods">
      <div class="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="ship-methods" class="text-[14.5px] font-semibold text-ink">Sposoby dostawy</h2>
          <p class="mt-0.5 text-[13px] text-ink-soft">Ceny brutto. Sposób powiązany z przewoźnikiem pozwala klientowi wybrać paczkomat, a Tobie utworzyć przesyłkę z zamówienia —
            konto przewoźnika podłączysz w <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'integracje']">Integracjach</a>.</p>
        </div>
        @if (canWrite && methods.value()?.length) {<button sv-button variant="tonal" size="sm" (click)="open(null)"><svg [lucideIcon]="icons.plus" />Dodaj</button>}
      </div>
      @if (methods.isLoading() && !methods.value()) {
        <div class="sv-card"><sv-loading variant="list" /></div>
      } @else if (methods.error()) {
        <sv-alert tone="error">Nie udało się wczytać metod dostawy.</sv-alert>
      } @else if (!methods.value()?.length) {
        <div class="sv-empty-box">
          <p>Bez sposobu dostawy klienci nie zamówią produktów fizycznych. Dodaj np. kuriera, paczkomat lub odbiór osobisty.</p>
          @if (canWrite) {<button sv-button variant="tonal" size="sm" (click)="open(null)"><svg [lucideIcon]="icons.plus" />Sposób dostawy</button>}
        </div>
      } @else {
        <ul class="sv-card overflow-hidden">
          @for (m of methods.value(); track m.id) {
            <li class="settings-item">
              <svg [lucideIcon]="icons.shipping" [size]="17" class="shrink-0 text-ink-soft" />
              <div class="min-w-0 flex-1">
                <p class="font-medium text-ink">{{ m.name }}</p>
                <p class="truncate text-[12px] text-ink-muted">{{ typeLabels[m.type] }}@if (m.carrier) { · {{ carrierName(m.carrier) }}}@if (m.freeFromMinor !== null) { · darmowa od {{ m.freeFromMinor | svMoney }}}@if (m.description) { · {{ m.description }}}</p>
              </div>
              <span class="text-[13px] font-medium tabular-nums text-ink">{{ m.priceMinor === 0 ? 'Bezpłatna' : (m.priceMinor | svMoney) }}</span>
              <span class="settings-pill" [class.!bg-success-soft]="m.active" [class.!text-success-ink]="m.active">{{ m.active ? 'Włączona' : 'Wyłączona' }}</span>
              @if (canWrite) {
                <span class="flex gap-0.5">
                  <button sv-button variant="ghost" size="icon" [attr.aria-label]="'Edytuj ' + m.name" (click)="open(m)"><svg [lucideIcon]="icons.pencil" /></button>
                  <button sv-button variant="ghost" size="icon" [attr.aria-label]="'Usuń ' + m.name" (click)="remove(m)"><svg [lucideIcon]="icons.trash" /></button>
                </span>
              }
            </li>
          }
        </ul>
      }
    </section>

    <sv-dialog [heading]="form()?.id ? 'Edytuj sposób dostawy' : 'Nowy sposób dostawy'" [open]="!!form()" (closed)="form.set(null)">
      @if (form(); as f) {
        <form id="ship-form" class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
          @if (error(); as e) {<sv-alert tone="error" class="sm:col-span-2">{{ e }}</sv-alert>}
          <sv-field label="Nazwa" for="s-name" class="sm:col-span-2"><input id="s-name" name="name" class="sv-input" maxlength="100" placeholder="np. Kurier DPD" [(ngModel)]="f.name" /></sv-field>
          <sv-field label="Rodzaj" for="s-type"><sv-select inputId="s-type" name="type" [options]="typeOptions" [(ngModel)]="f.type" ariaLabel="Rodzaj dostawy" /></sv-field>
          <sv-field label="Cena (brutto)" for="s-price"><input id="s-price" name="price" class="sv-input" inputmode="decimal" placeholder="0,00" [(ngModel)]="f.price" /></sv-field>
          <sv-field label="Darmowa od kwoty zamówienia" for="s-free" [optional]="true"><input id="s-free" name="free" class="sv-input" inputmode="decimal" [(ngModel)]="f.freeFrom" /></sv-field>
          <sv-field label="Opis" for="s-desc" [optional]="true"><input id="s-desc" name="desc" class="sv-input" maxlength="300" placeholder="np. 1–2 dni robocze" [(ngModel)]="f.description" /></sv-field>
          @if (f.type === 'COURIER' || f.type === 'PARCEL_LOCKER') {
            <sv-field label="Przewoźnik" for="s-carrier" class="sm:col-span-2"
              [hint]="carrierOptions(f.type).length > 1 ? 'Powiązanie pozwala tworzyć przesyłki i etykiety z poziomu zamówienia.' : 'Podłącz i włącz przewoźnika w Ustawieniach → Integracje, aby powiązać go z tą metodą.'">
              <sv-select inputId="s-carrier" name="carrier" [options]="carrierOptions(f.type)" [(ngModel)]="f.carrier" ariaLabel="Przewoźnik" />
            </sv-field>
          }
          <label class="flex items-center gap-2.5 text-[13px] text-ink sm:col-span-2"><input type="checkbox" role="switch" class="sv-switch" name="active" [(ngModel)]="f.active" />Dostępna przy zamówieniu</label>
        </form>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="form.set(null)">Anuluj</button>
        <button sv-button type="submit" form="ship-form" [loading]="saving()">Zapisz</button>
      </ng-container>
    </sv-dialog>

  `,
})
export class ShippingPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly shipping = inject(ShippingApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly typeLabels = SHIPPING_TYPE_LABELS;
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');
  protected readonly typeOptions: SelectOption[] = (['COURIER', 'PARCEL_LOCKER', 'POST', 'PICKUP'] as ShippingType[])
    .map((t) => ({ value: t, label: SHIPPING_TYPE_LABELS[t] }));
  protected readonly methods = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.shippingMethods(params) });
  protected readonly form = signal<Form | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Carrier accounts are managed in Settings → Integrations; here only to link a method with an enabled carrier. */
  private readonly carrierData = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.shipping.carriers(params) });

  protected carrierOptions(type: ShippingType): SelectOption[] {
    const d = this.carrierData.value();
    const enabled = (d?.carriers ?? []).filter((c) => c.services.includes(type) && d?.accounts.some((a) => a.carrierId === c.id && a.enabled))
      .map((c) => ({ id: c.id, name: c.name }));
    const current = this.form()?.carrier;
    const opts: SelectOption[] = [{ value: '', label: 'Bez integracji' }, ...enabled.map((c) => ({ value: c.id, label: c.name }))];
    if (current && !enabled.some((c) => c.id === current)) opts.push({ value: current, label: this.carrierName(current) + ' (wyłączony)' });
    return opts;
  }

  protected carrierName(id: string): string {
    return this.carrierData.value()?.carriers.find((c) => c.id === id)?.name ?? id;
  }

  protected open(m: ShippingMethod | null): void {
    this.error.set(null);
    this.form.set(m ? { id: m.id, name: m.name, description: m.description ?? '', type: m.type, price: moneyInput(m.priceMinor),
      freeFrom: moneyInput(m.freeFromMinor), active: m.active, version: m.version, carrier: m.carrier ?? '' }
      : { id: null, name: '', description: '', type: 'COURIER', price: '', freeFrom: '', active: true, version: 0, carrier: '' });
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f) return;
    const price = parseMoney(f.price);
    const free = parseMoney(f.freeFrom);
    if (price === undefined || price === null || free === undefined) {
      this.error.set('Podaj prawidłową cenę, np. 14,99 (0 = bezpłatna).');
      return;
    }
    this.saving.set(true);
    const input = { name: f.name.trim(), description: f.description.trim() || null, type: f.type, priceMinor: price, freeFromMinor: free,
      active: f.active, position: null, version: f.version,
      carrier: (f.type === 'COURIER' || f.type === 'PARCEL_LOCKER') && f.carrier ? f.carrier : null };
    try {
      await firstValueFrom(f.id ? this.api.updateShipping(this.ctx.tenantId(), f.id, input) : this.api.createShipping(this.ctx.tenantId(), input));
      this.toast.success('Zapisano sposób dostawy.');
      this.form.set(null);
      this.methods.reload();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(m: ShippingMethod): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteShipping(this.ctx.tenantId(), m.id));
      this.toast.success(`Usunięto: ${m.name}.`);
      this.methods.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}
