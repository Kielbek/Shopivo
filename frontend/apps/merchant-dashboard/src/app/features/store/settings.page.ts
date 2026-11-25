import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError, TenantApi } from '@shopivo/api-client';
import { StoreSettings } from '@shopivo/shared-models';
import {
  AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, PageHeaderComponent, SectionComponent, ToastService, controlError,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from './store-context';

const LOCALES = [
  { value: 'pl-PL', label: 'Polski' },
  { value: 'en-US', label: 'Angielski' },
  { value: 'de-DE', label: 'Niemiecki' },
];
const CURRENCIES = ['PLN', 'EUR', 'USD', 'CZK', 'GBP'];
const TIMEZONES = ['Europe/Warsaw', 'Europe/Berlin', 'Europe/London', 'Europe/Prague', 'UTC'];

@Component({
  selector: 'sv-settings-page',
  imports: [ReactiveFormsModule, PageHeaderComponent, SectionComponent, FieldComponent, ButtonComponent, AlertComponent,
    LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Ustawienia sklepu" description="Podstawowe informacje o sklepie i dane firmy sprzedającej." />
    @if (!canEdit) {
      <sv-alert class="mt-5">Twoja rola pozwala tylko na podgląd ustawień.</sv-alert>
    }

    <sv-section title="Informacje ogólne" description="Nazwa i ustawienia regionalne widoczne dla klientów.">
      <form [formGroup]="general" (ngSubmit)="saveGeneral()" class="space-y-4" novalidate>
        @if (generalMsg(); as m) {<sv-alert [tone]="m.tone">{{ m.text }}</sv-alert>}
        <sv-field label="Nazwa sklepu" for="name" [error]="err(general.controls.name)">
          <input id="name" class="sv-input" formControlName="name" maxlength="150" [attr.aria-invalid]="!!err(general.controls.name)" />
        </sv-field>
        <sv-field label="E-mail kontaktowy" for="contactEmail" [optional]="true" [error]="err(general.controls.contactEmail)"
          hint="Wyświetlany klientom w stopce i wiadomościach.">
          <input id="contactEmail" type="email" class="sv-input" formControlName="contactEmail" />
        </sv-field>
        <div class="grid gap-4 sm:grid-cols-3">
          <sv-field label="Język" for="defaultLocale">
            <select id="defaultLocale" class="sv-input" formControlName="defaultLocale">
              @for (l of locales; track l.value) {<option [value]="l.value">{{ l.label }}</option>}
            </select>
          </sv-field>
          <sv-field label="Waluta" for="defaultCurrency">
            <select id="defaultCurrency" class="sv-input" formControlName="defaultCurrency">
              @for (c of currencies; track c) {<option [value]="c">{{ c }}</option>}
            </select>
          </sv-field>
          <sv-field label="Strefa czasowa" for="timezone">
            <select id="timezone" class="sv-input" formControlName="timezone">
              @for (t of timezones; track t) {<option [value]="t">{{ t }}</option>}
            </select>
          </sv-field>
        </div>
        @if (canEdit) {
          <div class="flex justify-end"><button sv-button type="submit" [loading]="savingGeneral()">Zapisz</button></div>
        }
      </form>
    </sv-section>

    <sv-section title="Dane firmy" description="Dane sprzedawcy wymagane m.in. na fakturach i w regulaminie sklepu.">
      @if (settings.isLoading()) {
        <sv-loading />
      } @else if (settings.error()) {
        <sv-alert tone="error">Nie udało się wczytać danych firmy.</sv-alert>
      } @else {
        <form [formGroup]="company" (ngSubmit)="saveCompany()" class="space-y-4" novalidate>
          @if (companyMsg(); as m) {<sv-alert [tone]="m.tone">{{ m.text }}</sv-alert>}
          <sv-field label="Pełna nazwa firmy" for="legalCompanyName" [optional]="true">
            <input id="legalCompanyName" class="sv-input" formControlName="legalCompanyName" maxlength="255" autocomplete="organization" />
          </sv-field>
          <sv-field label="NIP" for="taxId" [optional]="true" [error]="companyErrors()['taxId']">
            <input id="taxId" class="sv-input" formControlName="taxId" maxlength="20" inputmode="numeric"
              [attr.aria-invalid]="!!companyErrors()['taxId']" />
          </sv-field>
          <sv-field label="Adres" for="addressLine1" [optional]="true">
            <input id="addressLine1" class="sv-input" formControlName="addressLine1" maxlength="200" autocomplete="address-line1" />
          </sv-field>
          <sv-field label="Adres — cd." for="addressLine2" [optional]="true">
            <input id="addressLine2" class="sv-input" formControlName="addressLine2" maxlength="200" autocomplete="address-line2" />
          </sv-field>
          <div class="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <sv-field label="Kod pocztowy" for="postalCode" [optional]="true" [error]="companyErrors()['postalCode']">
              <input id="postalCode" class="sv-input" formControlName="postalCode" maxlength="20" placeholder="00-000"
                autocomplete="postal-code" [attr.aria-invalid]="!!companyErrors()['postalCode']" />
            </sv-field>
            <sv-field label="Miejscowość" for="city" [optional]="true">
              <input id="city" class="sv-input" formControlName="city" maxlength="100" autocomplete="address-level2" />
            </sv-field>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <sv-field label="Telefon" for="phone" [optional]="true" [error]="companyErrors()['phone']">
              <input id="phone" type="tel" class="sv-input" formControlName="phone" maxlength="30" autocomplete="tel" />
            </sv-field>
            <sv-field label="E-mail do powiadomień o zamówieniach" for="orderEmail" [optional]="true"
              [error]="companyErrors()['orderEmail'] ?? err(company.controls.orderEmail)">
              <input id="orderEmail" type="email" class="sv-input" formControlName="orderEmail" />
            </sv-field>
          </div>
          <label class="flex items-start gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" formControlName="pricesIncludeTax" class="mt-0.5 sv-checkbox" />
            <span>Ceny produktów zawierają VAT (ceny brutto)</span>
          </label>
          @if (canEdit) {
            <div class="flex justify-end"><button sv-button type="submit" [loading]="savingCompany()">Zapisz dane firmy</button></div>
          }
        </form>
      }
    </sv-section>
  `,
})
export class SettingsPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly locales = LOCALES;
  protected readonly currencies = CURRENCIES;
  protected readonly timezones = TIMEZONES;
  protected readonly canEdit = this.ctx.can('STORE_SETTINGS_WRITE');

  protected readonly savingGeneral = signal(false);
  protected readonly savingCompany = signal(false);
  protected readonly generalMsg = signal<{ tone: 'success' | 'error'; text: string } | null>(null);
  protected readonly companyMsg = signal<{ tone: 'success' | 'error'; text: string } | null>(null);
  protected readonly companyErrors = signal<Record<string, string>>({});
  private settingsVersion = 0;

  protected readonly general = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    contactEmail: ['', [Validators.email]],
    defaultLocale: ['pl-PL'],
    defaultCurrency: ['PLN'],
    timezone: ['Europe/Warsaw'],
  });

  protected readonly company = this.fb.group({
    legalCompanyName: [''],
    taxId: [''],
    addressLine1: [''],
    addressLine2: [''],
    postalCode: [''],
    city: [''],
    phone: [''],
    orderEmail: ['', Validators.email],
    pricesIncludeTax: [true],
  });

  protected readonly settings = rxResource({
    params: () => this.ctx.tenantId(),
    stream: ({ params }) => this.api.settings(params),
  });

  constructor() {
    effect(() => {
      const store = this.ctx.store();
      if (store) {
        this.general.reset({
          name: store.name,
          contactEmail: store.contactEmail ?? '',
          defaultLocale: store.defaultLocale,
          defaultCurrency: store.defaultCurrency,
          timezone: store.timezone,
        });
      }
    });
    effect(() => {
      const s = this.settings.value();
      if (s) this.applySettings(s);
    });
    if (!this.canEdit) {
      this.general.disable();
      this.company.disable();
    }
  }

  protected err(control: Parameters<typeof controlError>[0]): string | null {
    return controlError(control);
  }

  private applySettings(s: StoreSettings): void {
    this.settingsVersion = s.version;
    this.company.reset({
      legalCompanyName: s.legalCompanyName ?? '',
      taxId: s.taxId ?? '',
      addressLine1: s.addressLine1 ?? '',
      addressLine2: s.addressLine2 ?? '',
      postalCode: s.postalCode ?? '',
      city: s.city ?? '',
      phone: s.phone ?? '',
      orderEmail: s.orderEmail ?? '',
      pricesIncludeTax: s.pricesIncludeTax,
    });
  }

  async saveGeneral(): Promise<void> {
    const store = this.ctx.store();
    if (!store) return;
    if (this.general.invalid) {
      this.general.markAllAsTouched();
      return;
    }
    this.savingGeneral.set(true);
    this.generalMsg.set(null);
    const v = this.general.getRawValue();
    try {
      const updated = await firstValueFrom(this.api.updateStore(store.tenantId, {
        ...v, name: v.name.trim(), contactEmail: v.contactEmail.trim() || null, version: store.version,
      }));
      this.ctx.updateStore(updated);
      this.toast.success('Zapisano informacje o sklepie.');
    } catch (e) {
      this.generalMsg.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.savingGeneral.set(false);
    }
  }

  async saveCompany(): Promise<void> {
    if (this.company.invalid) {
      this.company.markAllAsTouched();
      return;
    }
    this.savingCompany.set(true);
    this.companyMsg.set(null);
    this.companyErrors.set({});
    const v = this.company.getRawValue();
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    try {
      const saved = await firstValueFrom(this.api.updateSettings(this.ctx.tenantId(), {
        legalCompanyName: blank(v.legalCompanyName), taxId: blank(v.taxId), addressLine1: blank(v.addressLine1),
        addressLine2: blank(v.addressLine2), postalCode: blank(v.postalCode), city: blank(v.city), countryCode: 'PL',
        phone: blank(v.phone), orderEmail: blank(v.orderEmail), pricesIncludeTax: v.pricesIncludeTax,
        version: this.settingsVersion,
      }));
      this.applySettings(saved);
      this.toast.success('Zapisano dane firmy.');
    } catch (e) {
      const error = ApiError.from(e);
      if (error.code === 'INVALID_TAX_ID') this.companyErrors.set({ taxId: error.message });
      else if (error.code === 'INVALID_POSTAL_CODE') this.companyErrors.set({ postalCode: error.message });
      else if (Object.keys(error.fieldErrors).length) this.companyErrors.set(error.fieldErrors);
      else this.companyMsg.set({ tone: 'error', text: error.message });
    } finally {
      this.savingCompany.set(false);
    }
  }
}
