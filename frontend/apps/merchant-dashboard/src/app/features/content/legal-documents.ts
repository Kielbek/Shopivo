import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi, StorefrontAdminApi, TenantApi } from '@shopivo/api-client';
import { LegalKey, LegalSettings, LegalStatus, StoreSettings } from '@shopivo/shared-models';
import { AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, InfoTipComponent, LoadingComponent, ToastService, icons, plural } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { DevicePreviewComponent } from './device-preview';
import { RichPreviewComponent } from './rich-preview';

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
 * Legal documents: status and what is still missing, the real storefront page previewed on desktop / tablet / phone,
 * and one form for the data the templates use — after saving, chosen documents can be refreshed from the templates.
 */
@Component({
  selector: 'sv-legal-documents',
  imports: [RouterLink, LucideDynamicIcon, AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, InfoTipComponent, LoadingComponent,
    DevicePreviewComponent, RichPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sv-card mt-5" aria-labelledby="legal-heading">
      <div class="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5">
        <div class="min-w-0">
          <h2 id="legal-heading" class="flex items-center gap-1 text-[15px] font-semibold text-ink">Dokumenty prawne
            <sv-info-tip title="Dlaczego to ważne?" label="Dlaczego dokumenty prawne są ważne?"
              text="Sklep internetowy w Polsce musi mieć regulamin i politykę prywatności (prawa konsumenta, RODO). Wzory wypełniamy Twoimi danymi — przeczytaj je i dostosuj, najlepiej z prawnikiem. Każda opublikowana wersja jest zapisywana, a zamówienie pamięta, którą wersję zaakceptował klient." /></h2>
          <p class="mt-0.5 text-[12px] text-ink-muted">{{ readyCount() }} z {{ docs().length }} gotowe · regulamin i polityka prywatności są wymagane do publikacji sklepu.</p>
        </div>
        @if (canWrite) {
          <button sv-button variant="secondary" size="sm" (click)="openForm()"><svg [lucideIcon]="icons.pencil" />Dane w dokumentach</button>
        }
      </div>

      @if (legal.isLoading() && !legal.hasValue()) {
        <sv-loading variant="list" />
      } @else if (legal.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać dokumentów.</sv-alert></div>
      } @else {
        <div class="grid gap-5 p-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <ul class="space-y-2 self-start xl:sticky xl:top-20" role="listbox" aria-label="Dokumenty prawne">
            @for (l of docs(); track l.key) {
              <li role="option" [attr.aria-selected]="selected() === l.key">
                <button type="button" class="flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors"
                  [class]="selected() === l.key ? 'border-primary bg-primary-soft/60' : 'border-line hover:border-line-strong hover:bg-hover'"
                  (click)="touched = true; selected.set(l.key)">
                  <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px]" [class]="tone(l)">
                    <svg [lucideIcon]="l.entry?.status === 'PUBLISHED' && !l.missing.length ? icons.check : icons.legal" [size]="16" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[14px] font-medium text-ink">{{ l.title }}</span>
                    <span class="mt-1 flex flex-wrap items-center gap-1.5">
                      @if (!l.entry) {<sv-badge [tone]="l.requiredForPublish ? 'warning' : 'neutral'">Nie utworzono</sv-badge>}
                      @else if (l.entry.status === 'PUBLISHED') {<sv-badge tone="success">Opublikowany</sv-badge>}
                      @else {<sv-badge>Szkic</sv-badge>}
                      @if (l.requiredForPublish) {<span class="text-[11px] text-ink-muted">wymagany</span>}
                    </span>
                    @if (l.missing.length) {
                      <span class="mt-1.5 block text-[12px] text-warning-ink">Brakuje: {{ plural(l.missing.length, 'informacja', 'informacje', 'informacji') }}</span>
                    }
                  </span>
                </button>
              </li>
            }
          </ul>

          @if (current(); as l) {
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-0 flex-1">
                  <h3 class="text-[16px] font-semibold text-ink">{{ l.title }}</h3>
                  <p class="text-[12px] text-ink-muted">@if (l.entry) {{{ l.entry.path }} · @if (l.entry.status === 'PUBLISHED') {widoczny w sklepie} @else {szkic — klienci go nie widzą}} @else {Jeszcze nie utworzono — poniżej wzór z Twoimi danymi.}</p>
                </div>
                @if (canWrite) {
                  @if (l.entry) {
                    <button sv-button variant="ghost" size="sm" [loading]="busy() === 'regen-' + l.key" (click)="askRegenerate([l.key])"><svg [lucideIcon]="icons.refresh" />Odśwież z danych</button>
                    <a sv-button variant="secondary" size="sm" [routerLink]="[l.entry.id]"><svg [lucideIcon]="icons.pencil" />Edytuj treść</a>
                  } @else {
                    <button sv-button size="sm" [loading]="busy() === 'create-' + l.key" (click)="create(l.key)"><svg [lucideIcon]="icons.plus" />Utwórz ze wzoru</button>
                  }
                }
              </div>

              @if (l.missing.length || (!l.entry && templateMissing().length)) {
                <div class="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] bg-warning-soft px-4 py-3 text-[13px]">
                  <span class="min-w-0 flex-1 text-warning-ink">Do uzupełnienia: {{ (l.entry ? l.missing : templateMissing()).join(' · ') }}</span>
                  @if (canWrite) {<button sv-button size="sm" variant="secondary" (click)="openForm()">Uzupełnij dane</button>}
                </div>
              }

              <div class="mt-4">
                @if (l.entry) {
                  <sv-device-preview [url]="previewUrl()" [title]="'Podgląd: ' + l.title" />
                } @else if (template(); as body) {
                  <div class="max-h-[640px] overflow-y-auto rounded-[14px] border border-line bg-card p-6"><sv-rich-preview [source]="body" /></div>
                } @else {
                  <sv-loading variant="text" [rows]="8" />
                }
              </div>
            </div>
          }
        </div>
      }
    </section>

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

    <!-- Refresh documents from templates -->
    <sv-dialog heading="Zaktualizować treść dokumentów?" [open]="!!regenerate()" (closed)="regenerate.set(null)">
      @if (regenerate(); as keys) {
        <p class="text-[14px] text-ink-soft">Nowe dane trafią do dokumentów, gdy odświeżysz je ze wzoru. Zaznacz, które zaktualizować:</p>
        <ul class="mt-4 space-y-2">
          @for (l of existingDocs(); track l.key) {
            <li><label class="flex items-center gap-2.5 text-[14px] text-ink">
              <input type="checkbox" class="sv-checkbox" [checked]="keys.includes(l.key)" (change)="toggleRegen(l.key, $any($event.target).checked)" />{{ l.title }}
              @if (l.entry?.status === 'PUBLISHED') {<sv-badge tone="success">Opublikowany</sv-badge>}
            </label></li>
          }
        </ul>
        <sv-alert tone="warning" class="mt-4">Treść zostanie zastąpiona wzorem — Twoje ręczne zmiany w tych dokumentach znikną. Opublikowane dokumenty
          zmienią się w sklepie od razu; poprzednia wersja zostaje w historii, a zamówienia pamiętają wersję zaakceptowaną przez klienta.</sv-alert>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="regenerate.set(null)">Nie teraz</button>
        <button sv-button type="button" [disabled]="!regenerate()?.length" [loading]="busy() === 'regen'" (click)="runRegenerate()">Zaktualizuj dokumenty</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class LegalDocumentsComponent {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly tenant = inject(TenantApi);
  private readonly admin = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly plural = plural;
  protected readonly canWrite = this.ctx.can('CONTENT_WRITE');
  protected readonly shippingPresets = SHIPPING_PRESETS;
  protected readonly toolGroups = [
    { key: 'analytics' as const, field: 'analyticsTools' as const, label: 'Używam narzędzi do statystyk odwiedzin', placeholder: 'np. Google Analytics', suggestions: ANALYTICS },
    { key: 'marketing' as const, field: 'marketingTools' as const, label: 'Używam narzędzi reklamowych (piksele)', placeholder: 'np. Meta Pixel, Google Ads', suggestions: MARKETING },
  ];

  protected readonly legal = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.legal(params) });
  private readonly preview = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.admin.previewLink(params) });
  protected readonly selected = signal<LegalKey>('TERMS');
  protected readonly busy = signal<string | null>(null);
  protected readonly form = signal<Form | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly formError = signal<string | null>(null);
  protected readonly regenerate = signal<LegalKey[] | null>(null);
  private settings: StoreSettings | null = null;
  private legalSettings: LegalSettings | null = null;

  protected readonly docs = computed<LegalStatus[]>(() => (this.legal.hasValue() ? this.legal.value() : []));
  protected readonly existingDocs = computed(() => this.docs().filter((d) => d.entry));
  protected readonly current = computed(() => this.docs().find((d) => d.key === this.selected()) ?? null);
  protected readonly readyCount = computed(() => this.docs().filter((d) => d.entry?.status === 'PUBLISHED' && !d.missing.length).length);
  protected readonly previewUrl = computed(() => {
    const entry = this.current()?.entry;
    const link = this.preview.hasValue() ? this.preview.value()?.url : null;
    if (!entry || !link) return null;
    const url = new URL(link);
    url.pathname = entry.path;
    return url.toString();
  });

  /** Template body for a document that does not exist yet. */
  private readonly templateRes = rxResource({
    params: () => (this.current() && !this.current()!.entry ? { t: this.ctx.tenantId(), key: this.current()!.key } : undefined),
    stream: ({ params }) => this.api.legalTemplate(params.t, params.key),
  });
  protected readonly template = computed(() => (this.templateRes.hasValue() ? this.templateRes.value()?.body ?? null : null));
  protected readonly templateMissing = computed(() => (this.templateRes.hasValue() ? this.templateRes.value()?.missing ?? [] : []));

  constructor() {
    // Start on the first document that needs attention.
    effect(() => {
      const first = this.docs().find((d) => !d.entry || d.entry.status !== 'PUBLISHED' || d.missing.length);
      if (first && this.docs().length && !this.touched) this.selected.set(first.key);
    });
  }

  protected touched = false;

  protected tone(l: LegalStatus): string {
    if (l.entry?.status === 'PUBLISHED' && !l.missing.length) return 'bg-success/15 text-success-ink';
    if (l.requiredForPublish || l.missing.length) return 'bg-warning/20 text-warning-ink';
    return 'bg-canvas text-ink-soft';
  }

  protected async create(key: LegalKey): Promise<void> {
    this.busy.set('create-' + key);
    try {
      await firstValueFrom(this.api.createLegal(this.ctx.tenantId(), key));
      this.toast.success('Utworzono dokument jako szkic. Przeczytaj go i opublikuj w edytorze.');
      this.touched = true;
      this.legal.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }

  // ---- data form -------------------------------------------------------------------------------------------------
  protected async openForm(): Promise<void> {
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
      this.toast.success('Zapisano dane.');
      this.templateRes.reload();
      if (this.existingDocs().length) this.regenerate.set(this.existingDocs().map((d) => d.key));
    } catch (err) {
      const error = ApiError.from(err);
      if (error.code === 'INVALID_TAX_ID') this.errors.set({ taxId: error.message });
      else if (error.code === 'INVALID_POSTAL_CODE') this.errors.set({ postalCode: error.message });
      else this.formError.set(error.message);
    } finally {
      this.busy.set(null);
    }
  }

  // ---- refresh documents from templates ----------------------------------------------------------------------------
  protected askRegenerate(keys: LegalKey[]): void {
    this.regenerate.set(keys);
  }

  protected toggleRegen(key: LegalKey, on: boolean): void {
    this.regenerate.update((k) => (k ? (on ? [...new Set([...k, key])] : k.filter((x) => x !== key)) : k));
  }

  protected async runRegenerate(): Promise<void> {
    const keys = this.regenerate() ?? [];
    const t = this.ctx.tenantId();
    this.busy.set('regen');
    let done = 0;
    try {
      for (const key of keys) {
        const doc = this.docs().find((d) => d.key === key);
        if (!doc?.entry) continue;
        const [entry, tpl] = await Promise.all([firstValueFrom(this.api.get(t, doc.entry.id)), firstValueFrom(this.api.legalTemplate(t, key))]);
        await firstValueFrom(this.api.update(t, entry.id, {
          kind: entry.kind, title: entry.title, slug: entry.slug, excerpt: entry.excerpt, body: tpl.body, status: entry.status,
          showInFooter: entry.showInFooter, seoTitle: entry.seoTitle, seoDescription: entry.seoDescription, version: entry.version,
        }));
        done++;
      }
      this.toast.success(`Zaktualizowano ${done} ${done === 1 ? 'dokument' : done < 5 ? 'dokumenty' : 'dokumentów'}.`);
      this.regenerate.set(null);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
      this.legal.reload();
      this.preview.reload();
    }
  }
}
