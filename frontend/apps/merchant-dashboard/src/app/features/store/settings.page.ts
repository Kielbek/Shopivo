import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError, TenantApi } from '@shopivo/api-client';
import { StoreIndustry, StoreSettings } from '@shopivo/shared-models';
import {
  AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, SelectComponent, SelectOption, TabsComponent, ToastService,
  controlError,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from './store-context';
import { IndustryPickerComponent } from './industry-picker';
import { industryOf } from '../catalog/industries';

const LOCALES: SelectOption[] = [
  { value: 'pl-PL', label: 'Polski' },
  { value: 'en-US', label: 'Angielski' },
  { value: 'de-DE', label: 'Niemiecki' },
];
const CURRENCIES: SelectOption[] = [
  { value: 'PLN', label: 'PLN — złoty polski' },
  { value: 'EUR', label: 'EUR — euro' },
  { value: 'USD', label: 'USD — dolar amerykański' },
  { value: 'CZK', label: 'CZK — korona czeska' },
  { value: 'GBP', label: 'GBP — funt brytyjski' },
];
/** Must be valid IANA zone ids (validated by the backend). */
const TIMEZONES: SelectOption[] = [
  { value: 'Europe/Warsaw', label: 'Warszawa (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Prague', label: 'Praga (CET/CEST)' },
  { value: 'Europe/Vienna', label: 'Wiedeń (CET/CEST)' },
  { value: 'Europe/Paris', label: 'Paryż (CET/CEST)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Vilnius', label: 'Wilno (EET/EEST)' },
  { value: 'Europe/Kyiv', label: 'Kijów (EET/EEST)' },
  { value: 'Europe/London', label: 'Londyn (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'UTC', label: 'UTC' },
];

@Component({
  selector: 'sv-settings-page',
  imports: [IndustryPickerComponent, ReactiveFormsModule, TabsComponent, FieldComponent, SelectComponent, ButtonComponent, AlertComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-ink">Ustawienia</h1>
      <sv-tabs label="Sekcje ustawień" [tabs]="tabs" [(active)]="tab" />
    </div>
    @if (!canEdit) {
      <sv-alert class="mt-5">Twoja rola pozwala tylko na podgląd ustawień.</sv-alert>
    }

    @if (tab() === 'general') {
      <form id="panel-general" role="tabpanel" aria-labelledby="tab-general" [formGroup]="general" (ngSubmit)="saveGeneral()"
        class="sv-card mt-5" novalidate>
        <div class="px-5 pb-1 pt-5">
          <h2 class="text-[15px] font-semibold text-ink">Informacje o sklepie</h2>
          <p class="mt-0.5 text-[12px] text-ink-muted">Widoczne dla klientów w witrynie i wiadomościach.</p>
        </div>
        <div class="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
          @if (generalError(); as e) {<sv-alert tone="error" class="md:col-span-2">{{ e }}</sv-alert>}
          <sv-field label="Nazwa sklepu" for="name" [error]="err(general.controls.name)">
            <input id="name" class="sv-input" formControlName="name" maxlength="150" [attr.aria-invalid]="!!err(general.controls.name)" />
          </sv-field>
          <sv-field label="E-mail kontaktowy" for="contactEmail" [error]="err(general.controls.contactEmail)">
            <input id="contactEmail" type="email" class="sv-input" formControlName="contactEmail" placeholder="kontakt@twojsklep.pl" />
          </sv-field>
          <sv-field label="Język" for="defaultLocale">
            <sv-select inputId="defaultLocale" formControlName="defaultLocale" [options]="locales" ariaLabel="Język sklepu" />
          </sv-field>
          <sv-field label="Waluta" for="defaultCurrency">
            <sv-select inputId="defaultCurrency" formControlName="defaultCurrency" [options]="currencies" ariaLabel="Waluta" />
          </sv-field>
          <sv-field label="Strefa czasowa" for="timezone" class="md:col-span-2 md:max-w-[calc(50%-10px)]">
            <sv-select inputId="timezone" formControlName="timezone" [options]="timezones" ariaLabel="Strefa czasowa" />
          </sv-field>
        </div>
        @if (canEdit) {
          <div class="sv-card-footer">
            <button sv-button variant="ghost" type="button" [disabled]="general.pristine" (click)="resetGeneral()">Odrzuć zmiany</button>
            <button sv-button type="submit" [disabled]="general.pristine" [loading]="savingGeneral()">Zapisz</button>
          </div>
        }
      </form>

      <section class="sv-card mt-5" aria-labelledby="industry-heading">
        <div class="px-5 pb-1 pt-5">
          <h2 id="industry-heading" class="text-[15px] font-semibold text-ink">Branża</h2>
          <p class="mt-0.5 text-[12px] text-ink-muted">Na tej podstawie podpowiadamy rozmiary i kolory wariantów, kategorie startowe i typowe paczki.
            Branża nie ogranicza tego, co sprzedajesz, i nie jest widoczna dla klientów.</p>
        </div>
        <div class="p-5">
          @if (!editIndustry()) {
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-[14px] text-ink">{{ industryLabel() ?? 'Nie wybrano' }}</p>
              @if (canEdit) {<button sv-button variant="secondary" type="button" (click)="startIndustry()">{{ industryLabel() ? 'Zmień' : 'Wybierz branżę' }}</button>}
            </div>
          } @else {
            <sv-industry-picker [wide]="true" [(value)]="industry" />
          }
        </div>
        @if (editIndustry()) {
          <div class="sv-card-footer">
            <button sv-button variant="ghost" type="button" (click)="editIndustry.set(false)">Anuluj</button>
            <button sv-button type="button" [loading]="savingIndustry()" (click)="saveIndustry()">Zapisz branżę</button>
          </div>
        }
      </section>
    } @else {
      <div id="panel-company" role="tabpanel" aria-labelledby="tab-company" class="sv-card mt-5">
        <div class="px-5 pb-1 pt-5">
          <h2 class="text-[15px] font-semibold text-ink">Dane firmy</h2>
          <p class="mt-0.5 text-[12px] text-ink-muted">Dane sprzedawcy na dokumentach sprzedaży i w regulaminie sklepu.</p>
        </div>
        @if (settings.isLoading()) {
          <sv-loading variant="form" />
        } @else if (settings.error()) {
          <div class="p-5"><sv-alert tone="error">Nie udało się wczytać danych firmy.</sv-alert></div>
        } @else {
          <form [formGroup]="company" (ngSubmit)="saveCompany()" novalidate>
            <div class="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
              @if (companyError(); as e) {<sv-alert tone="error" class="md:col-span-2">{{ e }}</sv-alert>}
              <sv-field label="Pełna nazwa firmy" for="legalCompanyName" class="md:col-span-2">
                <input id="legalCompanyName" class="sv-input" formControlName="legalCompanyName" maxlength="255" autocomplete="organization"
                  placeholder="np. Pracownia Anna Nowak" />
              </sv-field>
              <sv-field label="NIP" for="taxId" [error]="companyErrors()['taxId']">
                <input id="taxId" class="sv-input" formControlName="taxId" maxlength="20" inputmode="numeric" placeholder="000-000-00-00"
                  [attr.aria-invalid]="!!companyErrors()['taxId']" />
              </sv-field>
              <sv-field label="Telefon" for="phone" [error]="companyErrors()['phone']">
                <input id="phone" type="tel" class="sv-input" formControlName="phone" maxlength="30" autocomplete="tel" placeholder="+48" />
              </sv-field>
              <sv-field label="Ulica i numer" for="addressLine1">
                <input id="addressLine1" class="sv-input" formControlName="addressLine1" maxlength="200" autocomplete="address-line1" />
              </sv-field>
              <sv-field label="Lokal, piętro" for="addressLine2">
                <input id="addressLine2" class="sv-input" formControlName="addressLine2" maxlength="200" autocomplete="address-line2" />
              </sv-field>
              <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-4">
                <sv-field label="Kod pocztowy" for="postalCode" [error]="companyErrors()['postalCode']">
                  <input id="postalCode" class="sv-input" formControlName="postalCode" maxlength="20" placeholder="00-000"
                    autocomplete="postal-code" [attr.aria-invalid]="!!companyErrors()['postalCode']" />
                </sv-field>
                <sv-field label="Miejscowość" for="city">
                  <input id="city" class="sv-input" formControlName="city" maxlength="100" autocomplete="address-level2" />
                </sv-field>
              </div>
              <sv-field label="E-mail do powiadomień o zamówieniach" for="orderEmail"
                [error]="companyErrors()['orderEmail'] ?? err(company.controls.orderEmail)">
                <input id="orderEmail" type="email" class="sv-input" formControlName="orderEmail" />
              </sv-field>
              <label class="flex items-center justify-between gap-4 rounded-[10px] bg-[#F7F8FA] px-4 py-3 md:col-span-2">
                <span>
                  <span class="block text-[13px] font-medium text-ink">Ceny zawierają VAT</span>
                  <span class="block text-[12px] text-ink-muted">Ceny produktów wprowadzasz jako brutto.</span>
                </span>
                <input type="checkbox" role="switch" formControlName="pricesIncludeTax" class="sv-switch" />
              </label>
            </div>
            @if (canEdit) {
              <div class="sv-card-footer">
                <button sv-button variant="ghost" type="button" [disabled]="company.pristine" (click)="resetCompany()">Odrzuć zmiany</button>
                <button sv-button type="submit" [disabled]="company.pristine" [loading]="savingCompany()">Zapisz dane firmy</button>
              </div>
            }
          </form>
        }
      </div>
    }
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
  protected readonly editIndustry = signal(false);
  protected readonly savingIndustry = signal(false);
  protected readonly industry = signal<StoreIndustry | null>(null);
  protected industryLabel(): string | null {
    return industryOf(this.ctx.store()?.industry)?.label ?? null;
  }

  protected startIndustry(): void {
    this.industry.set(this.ctx.store()?.industry ?? null);
    this.editIndustry.set(true);
  }

  protected async saveIndustry(): Promise<void> {
    this.savingIndustry.set(true);
    try {
      this.ctx.updateStore(await firstValueFrom(this.api.setIndustry(this.ctx.tenantId(), this.industry())));
      this.editIndustry.set(false);
      this.toast.success('Zapisano branżę sklepu.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.savingIndustry.set(false);
    }
  }
  protected readonly savingCompany = signal(false);
  protected readonly tabs = [{ id: 'general', label: 'Sklep' }, { id: 'company', label: 'Dane firmy' }];
  protected readonly tab = signal('general');
  protected readonly generalError = signal<string | null>(null);
  protected readonly companyError = signal<string | null>(null);
  private lastSettings: StoreSettings | null = null;
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
      if (store) this.applyStore(store);
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

  protected resetGeneral(): void {
    const store = this.ctx.store();
    if (store) this.applyStore(store);
  }

  protected resetCompany(): void {
    if (this.lastSettings) this.applySettings(this.lastSettings);
  }

  private applyStore(store: import('@shopivo/shared-models').Store): void {
    this.general.reset({
      name: store.name,
      contactEmail: store.contactEmail ?? '',
      defaultLocale: store.defaultLocale,
      defaultCurrency: store.defaultCurrency,
      timezone: store.timezone,
    });
  }

  private applySettings(s: StoreSettings): void {
    this.lastSettings = s;
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
    this.generalError.set(null);
    const v = this.general.getRawValue();
    try {
      const updated = await firstValueFrom(this.api.updateStore(store.tenantId, {
        ...v, name: v.name.trim(), contactEmail: v.contactEmail.trim() || null, version: store.version,
      }));
      this.ctx.updateStore(updated);
      this.toast.success('Zapisano informacje o sklepie.');
    } catch (e) {
      this.generalError.set(ApiError.from(e).message);
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
    this.companyError.set(null);
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
      else this.companyError.set(error.message);
    } finally {
      this.savingCompany.set(false);
    }
  }
}
