import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, OrdersApi } from '@shopivo/api-client';
import { SHIPPING_TYPE_LABELS, ShippingMethod, ShippingType } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent, FieldComponent, LoadingComponent,
  MoneyPipe, PageHeaderComponent, SelectComponent, SelectOption, ToastService, icons, moneyInput, parseMoney,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface Form { id: string | null; name: string; description: string; type: ShippingType; price: string; freeFrom: string; active: boolean; version: number; }

@Component({
  selector: 'sv-shipping-page',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, DialogComponent, FieldComponent, SelectComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Wysyłka" description="Sposoby dostawy widoczne przy zamówieniu. Ceny brutto; integracje z przewoźnikami pojawią się w module integracji.">
      @if (canWrite) {<button sv-button (click)="open(null)"><svg [lucideIcon]="icons.plus" />Dodaj sposób dostawy</button>}
    </sv-page-header>
    <sv-card class="mt-6" [flush]="true">
      @if (methods.isLoading() && !methods.value()) {
        <sv-loading />
      } @else if (methods.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać metod dostawy.</sv-alert></div>
      } @else if (!methods.value()?.length) {
        <sv-empty-state icon="shipping" title="Brak sposobów dostawy" description="Dodaj np. kuriera, paczkomat i odbiór osobisty — bez nich klienci nie zamówią produktów fizycznych." />
      } @else {
        <ul class="px-5 py-2">
          @for (m of methods.value(); track m.id) {
            <li class="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-canvas text-ink-soft"><svg [lucideIcon]="icons.shipping" [size]="18" /></span>
              <div class="min-w-0 flex-1">
                <p class="font-medium text-ink">{{ m.name }} @if (!m.active) {<sv-badge class="ml-1">Wyłączona</sv-badge>}</p>
                <p class="text-[12px] text-ink-muted">{{ typeLabels[m.type] }}@if (m.freeFromMinor !== null) { · darmowa od {{ m.freeFromMinor | svMoney }}}@if (m.description) { · {{ m.description }}}</p>
              </div>
              <span class="font-medium tabular-nums text-ink">{{ m.priceMinor === 0 ? 'Bezpłatna' : (m.priceMinor | svMoney) }}</span>
              @if (canWrite) {
                <span class="flex gap-1">
                  <button sv-button variant="ghost" size="icon" [attr.aria-label]="'Edytuj ' + m.name" (click)="open(m)"><svg [lucideIcon]="icons.pencil" /></button>
                  <button sv-button variant="ghost" size="icon" [attr.aria-label]="'Usuń ' + m.name" (click)="remove(m)"><svg [lucideIcon]="icons.trash" /></button>
                </span>
              }
            </li>
          }
        </ul>
      }
    </sv-card>

    <sv-dialog [heading]="form()?.id ? 'Edytuj sposób dostawy' : 'Nowy sposób dostawy'" [open]="!!form()" (closed)="form.set(null)">
      @if (form(); as f) {
        <form id="ship-form" class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
          @if (error(); as e) {<sv-alert tone="error" class="sm:col-span-2">{{ e }}</sv-alert>}
          <sv-field label="Nazwa" for="s-name" class="sm:col-span-2"><input id="s-name" name="name" class="sv-input" maxlength="100" placeholder="np. Kurier DPD" [(ngModel)]="f.name" /></sv-field>
          <sv-field label="Rodzaj" for="s-type"><sv-select inputId="s-type" name="type" [options]="typeOptions" [(ngModel)]="f.type" ariaLabel="Rodzaj dostawy" /></sv-field>
          <sv-field label="Cena (brutto)" for="s-price"><input id="s-price" name="price" class="sv-input" inputmode="decimal" placeholder="0,00" [(ngModel)]="f.price" /></sv-field>
          <sv-field label="Darmowa od kwoty zamówienia" for="s-free" [optional]="true"><input id="s-free" name="free" class="sv-input" inputmode="decimal" [(ngModel)]="f.freeFrom" /></sv-field>
          <sv-field label="Opis" for="s-desc" [optional]="true"><input id="s-desc" name="desc" class="sv-input" maxlength="300" placeholder="np. 1–2 dni robocze" [(ngModel)]="f.description" /></sv-field>
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
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
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

  protected open(m: ShippingMethod | null): void {
    this.error.set(null);
    this.form.set(m ? { id: m.id, name: m.name, description: m.description ?? '', type: m.type, price: moneyInput(m.priceMinor),
      freeFrom: moneyInput(m.freeFromMinor), active: m.active, version: m.version }
      : { id: null, name: '', description: '', type: 'COURIER', price: '', freeFrom: '', active: true, version: 0 });
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
      active: f.active, position: null, version: f.version };
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
