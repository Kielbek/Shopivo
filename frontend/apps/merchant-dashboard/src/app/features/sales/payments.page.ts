import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiError, OrdersApi } from '@shopivo/api-client';
import {
  AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, PageHeaderComponent, SectionComponent, ToastService, moneyInput,
  parseMoney,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { OnlinePaymentsComponent } from './online-payments';
import { StoreContext } from '../store/store-context';

/** Offline payment methods. Online operators (Przelewy24, PayU, Tpay) are connected in the integrations phase. */
@Component({
  selector: 'sv-payments-page',
  imports: [FormsModule, OnlinePaymentsComponent, PageHeaderComponent, SectionComponent, FieldComponent, ButtonComponent, AlertComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Płatności" description="Metody płatności dostępne dla Twoich klientów." />
    @if (settings.isLoading() && !settings.value()) {
      <sv-loading variant="form" />
    } @else {
      <form (ngSubmit)="save()">
        <fieldset [disabled]="!canWrite">
          <sv-section title="Przelew tradycyjny" description="Klient dostaje dane do przelewu w e-mailu z potwierdzeniem. Zamówienie oznaczasz jako opłacone po zaksięgowaniu.">
            <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="bt" [(ngModel)]="f.bankTransferEnabled" />Przyjmuj przelewy</label>
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <sv-field label="Numer rachunku" for="acc" class="sm:col-span-2" hint="26 cyfr (NRB) lub IBAN"><input id="acc" name="acc" class="sv-input" maxlength="40" [(ngModel)]="f.bankAccountNumber" /></sv-field>
              <sv-field label="Odbiorca" for="holder"><input id="holder" name="holder" class="sv-input" maxlength="200" [(ngModel)]="f.bankAccountHolder" /></sv-field>
              <sv-field label="Bank" for="bank" [optional]="true"><input id="bank" name="bank" class="sv-input" maxlength="100" [(ngModel)]="f.bankName" /></sv-field>
              <sv-field label="Termin płatności (dni)" for="days" hint="Po tym czasie nieopłacone zamówienie zostanie anulowane, a towar wróci do sprzedaży.">
                <input id="days" name="days" type="number" min="1" max="60" class="sv-input" [(ngModel)]="f.unpaidCancelDays" /></sv-field>
            </div>
          </sv-section>
          <sv-section title="Płatność przy odbiorze" description="Klient płaci kurierowi. Opłata za pobranie doliczana jest do zamówienia.">
            <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="cod" [(ngModel)]="f.codEnabled" />Przyjmuj płatność za pobraniem</label>
            <sv-field label="Opłata za pobranie (brutto)" for="fee" class="mt-4 block sm:w-60"><input id="fee" name="fee" class="sv-input" inputmode="decimal" [(ngModel)]="fee" /></sv-field>
          </sv-section>
        </fieldset>
        @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e }}</sv-alert>}
        @if (canWrite) {
          <div class="mt-5 flex justify-end"><button sv-button type="submit" [loading]="saving()">Zapisz</button></div>
        }
      </form>
    }
    <sv-online-payments />
  `,
})
export class PaymentsPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');
  protected readonly settings = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.paymentSettings(params) });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected f = { bankTransferEnabled: false, bankAccountHolder: '', bankAccountNumber: '', bankName: '', codEnabled: false,
    unpaidCancelDays: 7, version: -1 };
  protected fee = '0,00';

  constructor() {
    effect(() => {
      const s = this.settings.value();
      if (!s) return;
      this.f = { bankTransferEnabled: s.bankTransferEnabled, bankAccountHolder: s.bankAccountHolder ?? '', bankAccountNumber: s.bankAccountNumber ?? '',
        bankName: s.bankName ?? '', codEnabled: s.codEnabled, unpaidCancelDays: s.unpaidCancelDays, version: s.version };
      this.fee = moneyInput(s.codFeeMinor);
    });
  }

  protected async save(): Promise<void> {
    const fee = parseMoney(this.fee);
    if (fee === undefined) {
      this.error.set('Nieprawidłowa opłata za pobranie.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.updatePaymentSettings(this.ctx.tenantId(), { ...this.f,
        bankAccountHolder: this.f.bankAccountHolder.trim() || null, bankAccountNumber: this.f.bankAccountNumber.trim() || null,
        bankName: this.f.bankName.trim() || null, codFeeMinor: fee ?? 0, unpaidCancelDays: Number(this.f.unpaidCancelDays) }));
      this.settings.set(saved);
      this.toast.success('Zapisano ustawienia płatności.');
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
