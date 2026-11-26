import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi, TenantApi } from '@shopivo/api-client';
import { LegalSettings, StoreSettings } from '@shopivo/shared-models';
import { AlertComponent, ButtonComponent, DialogComponent, InfoTipComponent, ToastService } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const SHIPPING_PRESETS = ['w ciągu 24 godzin w dni robocze', 'do 2 dni roboczych od zaksięgowania płatności', 'do 5 dni roboczych od zaksięgowania płatności'];
const ANALYTICS = ['Google Analytics', 'Matomo', 'Microsoft Clarity', 'Hotjar'];
const MARKETING = ['Meta Pixel', 'Google Ads', 'TikTok Pixel', 'Pinterest Tag'];
const POSTAL = /^\d{2}-\d{3}$/;

interface Form {
  legalCompanyName: string; taxId: string; addressLine1: string; addressLine2: string; postalCode: string; city: string; orderEmail: string; phone: string;
  shippingTime: string; effectiveDate: string; sameReturns: boolean; returnsAddress: string; analytics: boolean; analyticsTools: string;
  marketing: boolean; marketingTools: string;
}

/**
 * "Data in the legal documents": the company data (shared with Settings → Company) and the facts the templates need
 * (shipping time, effective date, returns address, analytics / advertising tools). Emits {@link saved} after saving.
 */
@Component({
  selector: 'sv-legal-data-form',
  imports: [AlertComponent, ButtonComponent, DialogComponent, InfoTipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Data used by the templates -->
    <sv-dialog heading="Dane w dokumentach prawnych" [open]="!!form()" (closed)="closeForm()">
      @if (form(); as f) {
        <form id="legal-form" class="space-y-6" (submit)="$event.preventDefault(); saveForm()" novalidate>
          @if (formError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
          <fieldset class="grid gap-4 sm:grid-cols-2">
            <legend class="mb-3 text-[13px] font-semibold text-ink">Sprzedawca <span class="font-normal text-ink-muted">— zmienia też Ustawienia → Dane firmy</span></legend>
            <label class="block sm:col-span-2"><span class="sv-label">Pełna nazwa firmy</span>
              <input class="sv-input mt-1.5" maxlength="255" [value]="f.legalCompanyName" (input)="set('legalCompanyName', $event)" placeholder="np. Pracownia Glina Anna Nowak" /></label>
            <label class="block"><span class="sv-label">NIP</span>
              <input class="sv-input mt-1.5" maxlength="13" inputmode="numeric" [value]="f.taxId" (input)="set('taxId', $event)" placeholder="000-000-00-00" [attr.aria-invalid]="!!errors()['taxId']" />
              @if (errors()['taxId']; as e) {<span class="mt-1 block text-[12px] text-danger-ink">{{ e }}</span>}</label>
            <label class="block"><span class="sv-label">Telefon <span class="font-normal text-ink-muted">(opcjonalnie)</span></span>
              <input class="sv-input mt-1.5" type="tel" maxlength="30" [value]="f.phone" (input)="set('phone', $event)" /></label>
            <label class="block sm:col-span-2"><span class="sv-label">Ulica i numer</span>
              <input class="sv-input mt-1.5" maxlength="200" [value]="f.addressLine1" (input)="set('addressLine1', $event)" /></label>
            <label class="block"><span class="sv-label">Kod pocztowy</span>
              <input class="sv-input mt-1.5" maxlength="6" placeholder="00-000" [value]="f.postalCode" (input)="set('postalCode', $event)" [attr.aria-invalid]="!!errors()['postalCode']" />
              @if (errors()['postalCode']; as e) {<span class="mt-1 block text-[12px] text-danger-ink">{{ e }}</span>}</label>
            <label class="block"><span class="sv-label">Miejscowość</span>
              <input class="sv-input mt-1.5" maxlength="100" [value]="f.city" (input)="set('city', $event)" /></label>
            <label class="block sm:col-span-2"><span class="sv-label">E-mail kontaktowy w dokumentach</span>
              <input class="sv-input mt-1.5" type="email" maxlength="320" [value]="f.orderEmail" (input)="set('orderEmail', $event)" [attr.aria-invalid]="!!errors()['orderEmail']" />
              @if (errors()['orderEmail']; as e) {<span class="mt-1 block text-[12px] text-danger-ink">{{ e }}</span>}</label>
          </fieldset>

          <fieldset class="space-y-4 border-t border-line pt-5">
            <legend class="sr-only">Sprzedaż i zwroty</legend>
            <p class="text-[13px] font-semibold text-ink">Sprzedaż i zwroty</p>
            <div>
              <label class="block"><span class="sv-label">Termin wysyłki</span>
                <input class="sv-input mt-1.5" maxlength="200" [value]="f.shippingTime" (input)="set('shippingTime', $event)" placeholder="np. do 2 dni roboczych od zaksięgowania płatności" /></label>
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (p of shippingPresets; track p) {
                  <button type="button" class="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:border-primary hover:text-primary-strong" (click)="patch({ shippingTime: p })">{{ p }}</button>
                }
              </div>
            </div>
            <label class="block max-w-[240px]"><span class="sv-label">Regulamin obowiązuje od</span>
              <input class="sv-input mt-1.5" type="date" [value]="f.effectiveDate" (input)="set('effectiveDate', $event)" /></label>
            <label class="flex items-center gap-2.5 text-[13px] text-ink">
              <input type="checkbox" class="sv-checkbox" [checked]="f.sameReturns" (change)="patch({ sameReturns: $any($event.target).checked })" />Zwroty przyjmuję na adres firmy
            </label>
            @if (!f.sameReturns) {
              <label class="block"><span class="sv-label">Adres do zwrotów</span>
                <textarea class="sv-input mt-1.5 min-h-16 py-2" maxlength="400" [value]="f.returnsAddress" (input)="set('returnsAddress', $event)" placeholder="np. Magazyn, ul. Krótka 1, 30-001 Kraków"></textarea></label>
            }
          </fieldset>

          <fieldset class="space-y-4 border-t border-line pt-5">
            <legend class="sr-only">Pliki cookies</legend>
            <p class="flex items-center gap-1 text-[13px] font-semibold text-ink">Statystyki i reklamy w sklepie
              <sv-info-tip label="Po co te informacje?" text="Polityka prywatności musi wymieniać narzędzia, które śledzą odwiedzających (np. Google Analytics, Meta Pixel). Jeśli z nich nie korzystasz, zostaw wyłączone — napiszemy, że sklep nie używa takich plików cookies." /></p>
            @for (g of toolGroups; track g.key) {
              <div>
                <label class="flex items-center gap-2.5 text-[13px] text-ink">
                  <input type="checkbox" role="switch" class="sv-switch" [checked]="f[g.key]" (change)="patch(g.key === 'analytics' ? { analytics: $any($event.target).checked } : { marketing: $any($event.target).checked })" />{{ g.label }}
                </label>
                @if (f[g.key]) {
                  <input class="sv-input mt-2" maxlength="300" [placeholder]="g.placeholder" [value]="f[g.field]" (input)="set(g.field, $event)" [attr.aria-label]="g.label + ' — nazwy narzędzi'" />
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    @for (n of g.suggestions; track n) {
                      <button type="button" class="rounded-full border px-2.5 py-1 text-[12px]" [class]="hasTool(f[g.field], n) ? 'border-primary bg-primary-soft text-primary-strong' : 'border-line text-ink-soft hover:border-primary'"
                        [attr.aria-pressed]="hasTool(f[g.field], n)" (click)="toggleTool(g.field, n)">{{ n }}</button>
                    }
                  </div>
                }
              </div>
            }
          </fieldset>
        </form>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="closeForm()">Anuluj</button>
        <button sv-button type="submit" form="legal-form" [loading]="busy() === 'save'">Zapisz dane</button>
      </ng-container>
    </sv-dialog>

  `,
})
export class LegalDataFormComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly tenant = inject(TenantApi);
  private readonly toast = inject(ToastService);
  protected readonly shippingPresets = SHIPPING_PRESETS;
  protected readonly toolGroups = [
    { key: 'analytics' as const, field: 'analyticsTools' as const, label: 'Używam narzędzi do statystyk odwiedzin', placeholder: 'np. Google Analytics', suggestions: ANALYTICS },
    { key: 'marketing' as const, field: 'marketingTools' as const, label: 'Używam narzędzi reklamowych (piksele)', placeholder: 'np. Meta Pixel, Google Ads', suggestions: MARKETING },
  ];
  readonly saved = output<void>();
  protected readonly busy = signal<string | null>(null);
  protected readonly form = signal<Form | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly formError = signal<string | null>(null);
  private settings: StoreSettings | null = null;
  private legalSettings: LegalSettings | null = null;

  // ---- data form -------------------------------------------------------------------------------------------------
  /** Loads the current data and opens the dialog. */
  async openForm(): Promise<void> {
    this.formError.set(null);
    this.errors.set({});
    try {
      const t = this.ctx.tenantId();
      [this.settings, this.legalSettings] = await Promise.all([firstValueFrom(this.tenant.settings(t)), firstValueFrom(this.api.legalSettings(t))]);
      const s = this.settings;
      const l = this.legalSettings;
      this.form.set({
        legalCompanyName: s.legalCompanyName ?? '', taxId: s.taxId ?? '', addressLine1: s.addressLine1 ?? '', addressLine2: s.addressLine2 ?? '',
        postalCode: s.postalCode ?? '', city: s.city ?? '', orderEmail: s.orderEmail ?? '', phone: s.phone ?? '',
        shippingTime: l.shippingTime ?? '', effectiveDate: l.effectiveDate ?? new Date().toISOString().slice(0, 10),
        sameReturns: !l.returnsAddress, returnsAddress: l.returnsAddress ?? '',
        analytics: !!l.analyticsTools, analyticsTools: l.analyticsTools ?? '', marketing: !!l.marketingTools, marketingTools: l.marketingTools ?? '',
      });
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected closeForm(): void {
    if (this.busy() !== 'save') this.form.set(null);
  }

  protected set(key: keyof Form, event: Event): void {
    this.patch({ [key]: (event.target as HTMLInputElement).value } as Partial<Form>);
    if (this.errors()[key]) this.errors.update((e) => ({ ...e, [key]: '' }));
  }

  protected patch(p: Partial<Form>): void {
    this.form.update((f) => (f ? { ...f, ...p } : f));
  }

  protected hasTool(list: string, name: string): boolean {
    return list.split(',').map((x) => x.trim().toLowerCase()).includes(name.toLowerCase());
  }

  protected toggleTool(field: 'analyticsTools' | 'marketingTools', name: string): void {
    const f = this.form();
    if (!f) return;
    const items = f[field].split(',').map((x) => x.trim()).filter(Boolean);
    const next = this.hasTool(f[field], name) ? items.filter((x) => x.toLowerCase() !== name.toLowerCase()) : [...items, name];
    this.patch({ [field]: next.join(', ') } as Partial<Form>);
  }

  protected async saveForm(): Promise<void> {
    const f = this.form();
    if (!f || !this.settings || !this.legalSettings) return;
    const e: Record<string, string> = {};
    if (f.postalCode.trim() && !POSTAL.test(f.postalCode.trim())) e['postalCode'] = 'Kod pocztowy w formacie 00-000.';
    if (f.orderEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.orderEmail.trim())) e['orderEmail'] = 'Podaj prawidłowy adres e-mail.';
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    this.busy.set('save');
    this.formError.set(null);
    const t = this.ctx.tenantId();
    try {
      this.settings = await firstValueFrom(this.tenant.updateSettings(t, {
        ...this.settings, legalCompanyName: blank(f.legalCompanyName), taxId: blank(f.taxId), addressLine1: blank(f.addressLine1),
        addressLine2: blank(f.addressLine2), postalCode: blank(f.postalCode), city: blank(f.city), orderEmail: blank(f.orderEmail), phone: blank(f.phone),
      }));
      this.legalSettings = await firstValueFrom(this.api.saveLegalSettings(t, {
        shippingTime: blank(f.shippingTime), effectiveDate: f.effectiveDate || null, returnsAddress: f.sameReturns ? null : blank(f.returnsAddress),
        analyticsTools: f.analytics ? blank(f.analyticsTools) : null, marketingTools: f.marketing ? blank(f.marketingTools) : null,
        version: this.legalSettings.version,
      }));
      this.form.set(null);
      this.toast.success('Zapisano dane w dokumentach.');
      this.saved.emit();
    } catch (err) {
      const error = ApiError.from(err);
      if (error.code === 'INVALID_TAX_ID') this.errors.set({ taxId: error.message });
      else if (error.code === 'INVALID_POSTAL_CODE') this.errors.set({ postalCode: error.message });
      else this.formError.set(error.message);
    } finally {
      this.busy.set(null);
    }
  }
}
