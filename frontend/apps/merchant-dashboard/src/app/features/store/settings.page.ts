import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon } from '@lucide/angular';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError, TenantApi } from '@shopivo/api-client';
import { StoreIndustry, StoreSettings } from '@shopivo/shared-models';
import {
  AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, SelectComponent, SelectOption, ToastService,
  controlError, icons,
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
  imports: [IndustryPickerComponent, ReactiveFormsModule, NgTemplateOutlet, LucideDynamicIcon, FieldComponent, SelectComponent, ButtonComponent, AlertComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold tracking-[-0.02em] text-ink">{{ tab() === 'company' ? 'Dane firmy' : 'Ogólne' }}</h1>
        <p class="mt-1 max-w-2xl text-[13.5px] text-ink-soft">{{ tab() === 'company'
          ? 'Dane sprzedawcy wymagane przy sprzedaży na odległość. Pokazujemy je w stopce sklepu, w regulaminie i w e-mailach do klientów.'
          : 'Podstawowe informacje o sklepie, region i branża.' }}</p>
      </div>
      @if (!canEdit) {<sv-alert>Twoja rola pozwala tylko na podgląd ustawień.</sv-alert>}
    </header>

    @if (tab() === 'general') {
      <form id="settings-general" [formGroup]="general" (ngSubmit)="saveGeneral()" novalidate class="mt-6">
        @if (generalError(); as e) {<sv-alert tone="error" class="mb-5">{{ e }}</sv-alert>}

        <section class="settings-row" aria-labelledby="s-store">
          <div>
            <h2 id="s-store" class="settings-h">Sklep</h2>
            <p class="settings-p">Nazwa i e-mail widoczne dla klientów w sklepie i w wiadomościach o zamówieniach.</p>
          </div>
          <div class="sv-card space-y-4 p-5">
            <div class="grid gap-4 md:grid-cols-2">
              <sv-field label="Nazwa sklepu" for="name" [error]="err(general.controls.name)">
                <input id="name" class="sv-input" formControlName="name" maxlength="150" [attr.aria-invalid]="!!err(general.controls.name)" />
              </sv-field>
              <sv-field label="E-mail kontaktowy" for="contactEmail" [error]="err(general.controls.contactEmail)">
                <input id="contactEmail" type="email" class="sv-input" formControlName="contactEmail" placeholder="kontakt@twojsklep.pl" />
              </sv-field>
            </div>
            @if (ctx.store(); as st) {
              <div class="flex flex-wrap items-center gap-3 rounded-[12px] border border-line px-4 py-3">
                <span class="flex size-9 items-center justify-center rounded-[10px] bg-canvas text-ink-soft"><svg [lucideIcon]="icons.domains" [size]="17" /></span>
                <div class="min-w-0 flex-1">
                  <p class="text-[12px] text-ink-muted">Adres sklepu</p>
                  <p class="truncate text-[13.5px] font-medium text-ink">{{ st.primaryHostname || st.slug }}</p>
                </div>
                <span class="text-[12px] text-ink-muted">Własna domena — wkrótce</span>
              </div>
            }
          </div>
        </section>

        <section class="settings-row" aria-labelledby="s-region">
          <div>
            <h2 id="s-region" class="settings-h">Region i waluta</h2>
            <p class="settings-p">Język treści systemowych, waluta cen i strefa czasowa raportów oraz godzin zamówień.
              Waluty nie zmienisz po dodaniu pierwszego produktu lub zamówienia.</p>
          </div>
          <div class="sv-card grid gap-4 p-5 md:grid-cols-3">
            <sv-field label="Język" for="defaultLocale">
              <sv-select inputId="defaultLocale" formControlName="defaultLocale" [options]="locales" ariaLabel="Język sklepu" />
            </sv-field>
            <sv-field label="Waluta" for="defaultCurrency">
              <sv-select inputId="defaultCurrency" formControlName="defaultCurrency" [options]="currencies" ariaLabel="Waluta" />
            </sv-field>
            <sv-field label="Strefa czasowa" for="timezone">
              <sv-select inputId="timezone" formControlName="timezone" [options]="timezones" ariaLabel="Strefa czasowa" />
            </sv-field>
          </div>
        </section>
      </form>

      <section class="settings-row" aria-labelledby="s-industry">
        <div>
          <h2 id="s-industry" class="settings-h">Branża</h2>
          <p class="settings-p">Na tej podstawie podpowiadamy rozmiary i kolory wariantów, kategorie startowe i typowe paczki.
            Nie ogranicza tego, co sprzedajesz, i nie jest widoczna dla klientów.</p>
        </div>
        <div class="sv-card">
          <div class="p-5">
            @if (!editIndustry()) {
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <span class="flex size-9 items-center justify-center rounded-[10px] bg-canvas text-ink-soft"><svg [lucideIcon]="icons.tag" [size]="17" /></span>
                  <p class="text-[14px] font-medium text-ink">{{ industryLabel() ?? 'Nie wybrano' }}</p>
                </div>
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
        </div>
      </section>

      @if (canEdit && general.dirty) {
        <ng-container *ngTemplateOutlet="saveBar; context: { form: 'settings-general', busy: savingGeneral(), reset: resetGeneral.bind(this) }" />
      }
    } @else {
      @if (settings.isLoading() && !settings.hasValue()) {
        <div class="mt-6"><sv-loading variant="form" /></div>
      } @else if (settings.error()) {
        <sv-alert tone="error" class="mt-6">Nie udało się wczytać danych firmy.</sv-alert>
      } @else {
        <form id="settings-company" [formGroup]="company" (ngSubmit)="saveCompany()" novalidate class="mt-6">
          @if (companyError(); as e) {<sv-alert tone="error" class="mb-5">{{ e }}</sv-alert>}
          @if (missing().length) {
            <sv-alert tone="warning" class="mb-5">Do publikacji sklepu brakuje: {{ missing().join(', ') }}.</sv-alert>
          }

          <section class="settings-row" aria-labelledby="c-firm">
            <div>
              <h2 id="c-firm" class="settings-h">Firma</h2>
              <p class="settings-p">Pełna nazwa jak w CEIDG lub KRS i NIP — trafiają do regulaminu, stopki sklepu i potwierdzeń zamówień.</p>
            </div>
            <div class="sv-card grid gap-4 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <sv-field label="Pełna nazwa firmy" for="legalCompanyName">
                <input id="legalCompanyName" class="sv-input" formControlName="legalCompanyName" maxlength="255" autocomplete="organization"
                  placeholder="np. Pracownia Anna Nowak" />
              </sv-field>
              <sv-field label="NIP" for="taxId" [error]="companyErrors()['taxId']">
                <input id="taxId" class="sv-input" formControlName="taxId" maxlength="20" inputmode="numeric" placeholder="000-000-00-00"
                  [attr.aria-invalid]="!!companyErrors()['taxId']" />
              </sv-field>
            </div>
          </section>

          <section class="settings-row" aria-labelledby="c-address">
            <div>
              <h2 id="c-address" class="settings-h">Adres siedziby</h2>
              <p class="settings-p">Adres do korespondencji i reklamacji. Domyślnie także adres zwrotów w regulaminie.</p>
            </div>
            <div class="sv-card grid gap-4 p-5 md:grid-cols-6">
              <sv-field label="Ulica i numer" for="addressLine1" class="md:col-span-4">
                <input id="addressLine1" class="sv-input" formControlName="addressLine1" maxlength="200" autocomplete="address-line1" placeholder="ul. Kwiatowa 5" />
              </sv-field>
              <sv-field label="Lokal, piętro" for="addressLine2" [optional]="true" class="md:col-span-2">
                <input id="addressLine2" class="sv-input" formControlName="addressLine2" maxlength="200" autocomplete="address-line2" />
              </sv-field>
              <sv-field label="Kod pocztowy" for="postalCode" [error]="companyErrors()['postalCode']" class="md:col-span-2">
                <input id="postalCode" class="sv-input" formControlName="postalCode" maxlength="20" placeholder="00-000"
                  autocomplete="postal-code" [attr.aria-invalid]="!!companyErrors()['postalCode']" />
              </sv-field>
              <sv-field label="Miejscowość" for="city" class="md:col-span-2">
                <input id="city" class="sv-input" formControlName="city" maxlength="100" autocomplete="address-level2" />
              </sv-field>
              <sv-field label="Kraj" for="country" class="md:col-span-2">
                <input id="country" class="sv-input" value="Polska" disabled />
              </sv-field>
            </div>
          </section>

          <section class="settings-row" aria-labelledby="c-contact">
            <div>
              <h2 id="c-contact" class="settings-h">Kontakt</h2>
              <p class="settings-p">Telefon pokazujemy klientom. Na e-mail do powiadomień wysyłamy informacje o nowych zamówieniach i zwrotach.</p>
            </div>
            <div class="sv-card grid gap-4 p-5 md:grid-cols-2">
              <sv-field label="Telefon" for="phone" [error]="companyErrors()['phone']">
                <input id="phone" type="tel" class="sv-input" formControlName="phone" maxlength="30" autocomplete="tel" placeholder="+48 600 100 200" />
              </sv-field>
              <sv-field label="E-mail do powiadomień o zamówieniach" for="orderEmail"
                [error]="companyErrors()['orderEmail'] ?? err(company.controls.orderEmail)">
                <input id="orderEmail" type="email" class="sv-input" formControlName="orderEmail" placeholder="zamowienia@twojafirma.pl" />
              </sv-field>
            </div>
          </section>

          <section class="settings-row" aria-labelledby="c-tax">
            <div>
              <h2 id="c-tax" class="settings-h">Ceny i podatki</h2>
              <p class="settings-p">Określa, jak wpisujesz ceny produktów. Klient zawsze widzi ceny brutto.</p>
            </div>
            <div class="sv-card p-5">
              <label class="flex items-center justify-between gap-4">
                <span>
                  <span class="block text-[14px] font-medium text-ink">Ceny zawierają VAT</span>
                  <span class="block text-[12.5px] text-ink-muted">Wprowadzasz ceny brutto. Wyłącz, jeśli wolisz podawać ceny netto.</span>
                </span>
                <input type="checkbox" role="switch" formControlName="pricesIncludeTax" class="sv-switch" />
              </label>
            </div>
          </section>
        </form>
        @if (canEdit && company.dirty) {
          <ng-container *ngTemplateOutlet="saveBar; context: { form: 'settings-company', busy: savingCompany(), reset: resetCompany.bind(this) }" />
        }
      }
    }

    <!-- Unsaved changes: one floating bar for the whole page (instead of a save button in every card). -->
    <ng-template #saveBar let-form="form" let-busy="busy" let-reset="reset">
      <div class="sticky bottom-5 z-20 mt-8 flex justify-center" role="region" aria-label="Niezapisane zmiany">
        <div class="flex items-center gap-3 rounded-full bg-night py-2 pl-5 pr-2 text-white shadow-[0_16px_40px_-12px_rgba(15,18,16,0.5)]">
          <span class="size-2 rounded-full bg-neon" aria-hidden="true"></span>
          <span class="text-[13.5px] font-medium">Niezapisane zmiany</span>
          <button type="button" class="h-9 rounded-full px-4 text-[13px] font-medium text-white/75 hover:bg-white/10 hover:text-white" (click)="reset()">Odrzuć</button>
          <button sv-button variant="accent" size="sm" type="submit" [attr.form]="form" [loading]="busy" class="!h-9">Zapisz</button>
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    .settings-row { display: grid; gap: 1rem; padding-block: 1.75rem; border-top: 1px solid var(--color-line); }
    form > .settings-row:first-of-type { border-top: 0; padding-top: 0.5rem; }
    @media (min-width: 1024px) { .settings-row { grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 2.5rem; } }
    .settings-h { font-size: 15px; font-weight: 600; color: var(--color-ink); }
    .settings-p { margin-top: 0.25rem; font-size: 13px; line-height: 1.55; color: var(--color-ink-soft); }
  `,
})
export class SettingsPage {
  protected readonly ctx = inject(StoreContext);
  protected readonly icons = icons;
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
  /** Route data: `company` for /ustawienia/firma (each section has its own address in the settings navigation). */
  readonly sekcja = input<string>();
  protected readonly tab = computed(() => (this.sekcja() === 'company' ? 'company' : 'general'));
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

  private readonly companyValue = toSignal(this.company.valueChanges, { initialValue: this.company.getRawValue() });
  /** Data still needed to publish the store (same rule as the publication checklist). */
  protected readonly missing = computed(() => {
    const v = { ...this.company.getRawValue(), ...this.companyValue() };
    return [
      !v.legalCompanyName?.trim() && 'pełna nazwa firmy', !v.taxId?.trim() && 'NIP', !v.addressLine1?.trim() && 'adres',
      !(v.orderEmail?.trim() || this.ctx.store()?.contactEmail) && 'e-mail',
    ].filter((x): x is string => !!x);
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
