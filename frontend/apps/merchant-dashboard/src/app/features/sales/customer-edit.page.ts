import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, OrdersApi } from '@shopivo/api-client';
import { CONSENT_SOURCE_LABELS, Customer, CustomerAddress, CustomerInput, ORDER_STATUS_LABELS } from '@shopivo/shared-models';
import {
  AlertComponent, BackIconComponent, BadgeComponent, ButtonComponent, DatePipe, FieldComponent, LoadingComponent, MoneyPipe, SelectComponent,
  SelectOption, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom, of } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { ORDER_TONE } from './order-tones';
import { COUNTRY_CODES, countryName, customerName } from './customer-format';

interface Form {
  firstName: string; lastName: string; email: string; phone: string; acceptsMarketing: boolean; note: string; tags: string[];
  hasAddress: boolean; company: string; line1: string; line2: string; postalCode: string; city: string; countryCode: string;
}

const EMPTY: Form = {
  firstName: '', lastName: '', email: '', phone: '', acceptsMarketing: false, note: '', tags: [],
  hasAddress: false, company: '', line1: '', line2: '', postalCode: '', city: '', countryCode: 'PL',
};

/** Add (`klienci/nowy`) or edit (`klienci/:customerId`) a customer — profile, consent, default address, notes, tags, orders. */
@Component({
  selector: 'sv-customer-edit-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, BackIconComponent, BadgeComponent, ButtonComponent, AlertComponent, FieldComponent,
    LoadingComponent, SelectComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="../" class="group inline-flex items-center text-[13px] text-ink-muted hover:text-ink">
      <sv-back-icon icon="users" [size]="14" label="Klienci" />
    </a>

    @if (customerId() && customer.isLoading() && !customer.value()) {
      <sv-loading class="mt-2" variant="detail" />
    } @else if (customerId() && customer.error()) {
      <sv-alert tone="error" class="mt-6">Nie znaleziono klienta.</sv-alert>
    } @else {
      <header class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-[24px] font-semibold tracking-[-0.02em] text-ink">{{ heading() }}</h1>
        @if (current(); as c) {
          @if (c.accountCreatedAt) {<sv-badge tone="info">Konto w sklepie</sv-badge>}
          @if (c.acceptsMarketing) {<sv-badge tone="success">Zasubskrybowano</sv-badge>}
        }
      </header>
      @if (current(); as c) {
        <p class="mt-1 text-[13.5px] text-ink-soft">{{ location(c) || 'Brak adresu' }} · klient od {{ c.createdAt | svDate: 'date' }}</p>
      }
      @if (!canWrite) {<sv-alert class="mt-4">Twoja rola pozwala tylko na podgląd danych klienta.</sv-alert>}
      @if (error(); as e) {<sv-alert tone="error" class="mt-5">{{ e }}</sv-alert>}

      <form id="customer-form" class="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" (ngSubmit)="save()" (input)="touch()" (change)="touch()" novalidate>
        <div class="min-w-0 space-y-5">
          @if (current(); as c) {
            <section class="sv-card grid grid-cols-3 divide-x divide-line p-0" aria-label="Podsumowanie">
              <div class="px-5 py-4"><p class="text-[12.5px] text-ink-muted">Wydana kwota</p><p class="mt-1 text-[18px] font-semibold tabular-nums text-ink">{{ c.totalSpentMinor | svMoney }}</p></div>
              <div class="px-5 py-4"><p class="text-[12.5px] text-ink-muted">Zamówienia</p><p class="mt-1 text-[18px] font-semibold tabular-nums text-ink">{{ c.ordersCount }}</p></div>
              <div class="px-5 py-4"><p class="text-[12.5px] text-ink-muted">Ostatnie zamówienie</p>
                <p class="mt-1 text-[15px] font-medium text-ink">{{ c.lastOrderAt ? (c.lastOrderAt | svDate: 'relative') : '—' }}</p></div>
            </section>
          }

          <section aria-labelledby="c-overview">
            <h2 id="c-overview" class="mb-2.5 text-[14.5px] font-semibold text-ink">Przegląd klienta</h2>
            <div class="sv-card overflow-hidden p-0">
              <div class="grid gap-4 p-5 md:grid-cols-2">
                <sv-field label="Imię" for="c-first"><input id="c-first" name="firstName" class="sv-input" maxlength="100" autocomplete="off" [(ngModel)]="form.firstName" [disabled]="!canWrite" /></sv-field>
                <sv-field label="Nazwisko" for="c-last"><input id="c-last" name="lastName" class="sv-input" maxlength="100" autocomplete="off" [(ngModel)]="form.lastName" [disabled]="!canWrite" /></sv-field>
                <sv-field class="md:col-span-2" label="E-mail" for="c-email" [error]="emailError()"
                  [hint]="emailLocked() ? 'Adres jest loginem klienta do konta w sklepie — zmienić go może tylko klient.' : undefined">
                  <input id="c-email" name="email" type="email" class="sv-input" maxlength="320" autocomplete="off" [(ngModel)]="form.email"
                    [disabled]="!canWrite || emailLocked()" [attr.aria-invalid]="!!emailError()" />
                </sv-field>
                <sv-field class="md:col-span-2" label="Numer telefonu" for="c-phone" [optional]="true">
                  <input id="c-phone" name="phone" type="tel" class="sv-input" maxlength="30" placeholder="+48 600 000 000" autocomplete="off" [(ngModel)]="form.phone" [disabled]="!canWrite" />
                </sv-field>
                <label class="flex items-start gap-2.5 text-[13.5px] text-ink md:col-span-2">
                  <input type="checkbox" name="acceptsMarketing" class="sv-checkbox mt-0.5" [(ngModel)]="form.acceptsMarketing" [disabled]="!canWrite" />
                  Klient wyraził zgodę na otrzymywanie e-maili marketingowych.
                </label>
              </div>
              <p class="border-t border-line bg-canvas px-5 py-3 text-[12.5px] text-ink-soft">
                @if (current()?.acceptsMarketing && current()!.marketingConsentAt) {
                  Zgoda z {{ current()!.marketingConsentAt | svDate: 'date' }}@if (current()!.marketingConsentSource; as src) { ({{ sourceLabels[src] }})}.
                  Odznaczenie pola wycofa zgodę.
                } @else {
                  Zanim zapiszesz klienta do subskrypcji e-maili marketingowych, poproś go o zgodę. Zapisujemy datę i źródło zgody.
                }
              </p>
            </div>
          </section>

          <section aria-labelledby="c-address">
            <h2 id="c-address" class="text-[14.5px] font-semibold text-ink">Adres domyślny</h2>
            <p class="mb-2.5 mt-0.5 text-[13px] text-ink-soft">Główny adres tego klienta. Przy pierwszym zamówieniu uzupełniamy go adresem dostawy.</p>
            @if (form.hasAddress) {
              <div class="sv-card grid gap-4 p-5 md:grid-cols-2">
                <sv-field class="md:col-span-2" label="Firma" for="a-company" [optional]="true"><input id="a-company" name="company" class="sv-input" maxlength="200" [(ngModel)]="form.company" [disabled]="!canWrite" /></sv-field>
                <sv-field class="md:col-span-2" label="Ulica i numer" for="a-line1"><input id="a-line1" name="line1" class="sv-input" maxlength="200" [(ngModel)]="form.line1" [disabled]="!canWrite" /></sv-field>
                <sv-field class="md:col-span-2" label="Mieszkanie, piętro itp." for="a-line2" [optional]="true"><input id="a-line2" name="line2" class="sv-input" maxlength="200" [(ngModel)]="form.line2" [disabled]="!canWrite" /></sv-field>
                <sv-field label="Kod pocztowy" for="a-postal"><input id="a-postal" name="postalCode" class="sv-input" maxlength="20" placeholder="00-000" [(ngModel)]="form.postalCode" [disabled]="!canWrite" /></sv-field>
                <sv-field label="Miejscowość" for="a-city"><input id="a-city" name="city" class="sv-input" maxlength="100" [(ngModel)]="form.city" [disabled]="!canWrite" /></sv-field>
                <sv-field label="Kraj" for="a-country">
                  <sv-select inputId="a-country" [options]="countries" [value]="form.countryCode" (valueChange)="form.countryCode = $event || 'PL'; touch()" ariaLabel="Kraj" [disabled]="!canWrite" />
                </sv-field>
                @if (canWrite) {
                  <div class="flex items-end justify-end"><button type="button" class="h-9 text-[13px] text-ink-muted hover:text-danger-ink" (click)="form.hasAddress = false; touch()">Usuń adres</button></div>
                }
              </div>
            } @else {
              <div class="sv-card p-2">
                <button type="button" class="settings-item w-full rounded-[10px]" [disabled]="!canWrite" (click)="form.hasAddress = true; touch()">
                  <svg [lucideIcon]="icons.plus" [size]="17" class="text-ink-soft" /><span class="flex-1 text-left">Dodaj adres</span>
                  <svg [lucideIcon]="icons.chevronRight" [size]="16" class="text-ink-muted" />
                </button>
              </div>
            }
          </section>

          @if (current()) {
            <section aria-labelledby="c-orders">
              <h2 id="c-orders" class="mb-2.5 text-[14.5px] font-semibold text-ink">Zamówienia</h2>
              <div class="sv-card p-0">
                @if (orders.isLoading() && !orders.value()) {<sv-loading variant="table" [rows]="3" />}
                @else {
                  <ul class="divide-y divide-line">
                    @for (o of orders.value()?.items; track o.id) {
                      <li>
                        <a class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[13.5px] hover:bg-hover" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia', o.id]">
                          <span class="font-medium text-ink">#{{ o.number }}</span>
                          <span class="text-ink-muted">{{ o.createdAt | svDate: 'date' }}</span>
                          <sv-badge [tone]="orderTone[o.status]">{{ statusLabels[o.status] }}</sv-badge>
                          <span class="ml-auto tabular-nums text-ink">{{ o.totalMinor | svMoney }}</span>
                        </a>
                      </li>
                    } @empty {
                      <li class="px-5 py-6 text-center text-[13px] text-ink-muted">Ten klient nie złożył jeszcze zamówienia.</li>
                    }
                  </ul>
                }
              </div>
            </section>
          }
        </div>

        <aside class="space-y-5">
          <section class="sv-card p-5" aria-labelledby="c-notes">
            <h2 id="c-notes" class="text-[14px] font-semibold text-ink">Notatki</h2>
            <p class="mt-0.5 text-[12.5px] text-ink-muted">Prywatne — widzi je tylko Twój zespół.</p>
            <textarea name="note" class="sv-input mt-3 min-h-24 py-2.5" maxlength="2000" aria-labelledby="c-notes" [(ngModel)]="form.note" [disabled]="!canWrite"></textarea>
          </section>

          <section class="sv-card p-5" aria-labelledby="c-tags">
            <h2 id="c-tags" class="text-[14px] font-semibold text-ink">Tagi</h2>
            <p class="mt-0.5 text-[12.5px] text-ink-muted">Np. VIP, hurt — do wyszukiwania i filtrowania.</p>
            @if (form.tags.length) {
              <ul class="mt-3 flex flex-wrap gap-1.5">
                @for (t of form.tags; track t) {
                  <li class="sv-chip !text-[12px]">{{ t }}
                    @if (canWrite) {
                      <button type="button" class="-mr-0.5 rounded-full p-0.5 text-ink-muted hover:bg-black/10 hover:text-ink" [attr.aria-label]="'Usuń tag ' + t" (click)="removeTag(t)">
                        <svg [lucideIcon]="icons.close" [size]="11" /></button>
                    }
                  </li>
                }
              </ul>
            }
            @if (canWrite && form.tags.length < 20) {
              <input class="sv-input mt-3" name="newTag" maxlength="40" list="customer-tag-list" placeholder="Dodaj tag i naciśnij Enter" aria-label="Nowy tag"
                [(ngModel)]="newTag" (keydown.enter)="$event.preventDefault(); addTag()" (keydown)="onTagKey($event)" (blur)="addTag()" />
              <datalist id="customer-tag-list">@for (t of tagSuggestions(); track t) {<option [value]="t"></option>}</datalist>
            }
          </section>
        </aside>
      </form>

      @if (canWrite && dirty()) {
        <div class="sticky bottom-5 z-20 mt-8 flex justify-center" role="region" aria-label="Niezapisane zmiany">
          <div class="flex items-center gap-3 rounded-full bg-night py-2 pl-5 pr-2 text-white shadow-[0_16px_40px_-12px_rgba(15,18,16,0.5)]">
            <span class="size-2 rounded-full bg-neon" aria-hidden="true"></span>
            <span class="text-[13.5px] font-medium">{{ customerId() ? 'Niezapisane zmiany' : 'Nowy klient' }}</span>
            <button type="button" class="h-9 rounded-full px-4 text-[13px] font-medium text-white/75 hover:bg-white/10 hover:text-white" (click)="discard()">Odrzuć</button>
            <button sv-button variant="accent" size="sm" type="submit" form="customer-form" [loading]="saving()" class="!h-9">Zapisz</button>
          </div>
        </div>
      }
    }
  `,
})
export class CustomerEditPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly orderTone = ORDER_TONE;
  protected readonly sourceLabels = CONSENT_SOURCE_LABELS;
  protected readonly canWrite = this.ctx.can('CUSTOMERS_WRITE');
  protected readonly countries: SelectOption[] = COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c) }));

  /** Route param; absent on `klienci/nowy`. */
  readonly customerId = input<string>();

  protected form: Form = { ...EMPTY, tags: [] };
  private snapshot = JSON.stringify(EMPTY);
  /** Bumped on every edit so `dirty()` re-evaluates (the form is a plain object bound with ngModel). */
  private readonly revision = signal(0);
  protected newTag = '';
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly emailError = signal<string | null>(null);
  protected readonly current = signal<Customer | null>(null);

  protected readonly customer = rxResource({
    params: () => (this.customerId() ? { t: this.ctx.tenantId(), id: this.customerId()! } : undefined),
    stream: ({ params }) => this.api.customer(params.t, params.id),
  });
  protected readonly orders = rxResource({
    params: () => (this.current() ? { t: this.ctx.tenantId(), id: this.current()!.id } : undefined),
    stream: ({ params }) => this.api.orders(params.t, { customerId: params.id, page: 0, size: 20 }),
  });
  private readonly allTags = rxResource({
    params: () => ({ t: this.ctx.tenantId() }),
    stream: ({ params }) => (this.canWrite ? this.api.customerTags(params.t) : of([])),
  });
  protected readonly tagSuggestions = computed(() => {
    this.revision();
    const have = new Set(this.form.tags.map((t) => t.toLowerCase()));
    return (this.allTags.value() ?? []).filter((t) => !have.has(t.toLowerCase()));
  });

  protected readonly heading = computed(() => (this.current() ? customerName(this.current()!) : 'Nowy klient'));
  protected readonly emailLocked = computed(() => !!this.current()?.accountCreatedAt);
  protected readonly dirty = computed(() => {
    this.revision();
    return JSON.stringify(this.form) !== this.snapshot;
  });

  constructor() {
    effect(() => {
      const c = this.customer.value();
      if (c) untracked(() => this.load(c));
    });
  }

  /** Re-evaluates `dirty()`: called on every input/change event of the form (ngModel has written by then) and after programmatic edits. */
  protected touch(): void {
    this.revision.update((r) => r + 1);
  }

  protected location(c: Customer): string {
    return [c.address.city, countryName(c.address.countryCode)].filter(Boolean).join(', ');
  }

  protected addTag(): void {
    const t = this.newTag.trim().replace(/\s+/g, ' ').replace(/,$/, '');
    this.newTag = '';
    if (!t || this.form.tags.some((x) => x.toLowerCase() === t.toLowerCase()) || this.form.tags.length >= 20) return;
    this.form.tags = [...this.form.tags, t.slice(0, 40)];
    this.touch();
  }

  /** A comma also confirms a tag (like Enter). */
  protected onTagKey(e: KeyboardEvent): void {
    if (e.key === ',') {
      e.preventDefault();
      this.addTag();
    }
  }

  protected removeTag(t: string): void {
    this.form.tags = this.form.tags.filter((x) => x !== t);
    this.touch();
  }

  protected discard(): void {
    const c = this.current();
    if (c) {
      this.load(c);
    } else {
      void this.router.navigate(['/sklep', this.ctx.tenantId(), 'klienci']);
    }
  }

  protected async save(): Promise<void> {
    if (!this.canWrite || this.saving()) return;
    this.error.set(null);
    this.emailError.set(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(this.form.email.trim())) {
      this.emailError.set('Podaj prawidłowy adres e-mail.');
      return;
    }
    const f = this.form;
    if (f.hasAddress && (!f.line1.trim() || !f.postalCode.trim() || !f.city.trim())) {
      this.error.set('Adres musi mieć ulicę z numerem, kod pocztowy i miejscowość — albo usuń adres.');
      return;
    }
    const address: CustomerAddress | null = f.hasAddress
      ? { company: f.company || null, line1: f.line1, line2: f.line2 || null, postalCode: f.postalCode, city: f.city, countryCode: f.countryCode }
      : null;
    const input: CustomerInput = {
      email: f.email.trim(), firstName: f.firstName || null, lastName: f.lastName || null, phone: f.phone || null,
      acceptsMarketing: f.acceptsMarketing, note: f.note || null, address, tags: f.tags,
    };
    this.saving.set(true);
    try {
      const c = this.current();
      if (c) {
        this.load(await firstValueFrom(this.api.updateCustomer(this.ctx.tenantId(), c.id, input, c.version)));
        this.toast.success('Zapisano dane klienta.');
      } else {
        const created = await firstValueFrom(this.api.createCustomer(this.ctx.tenantId(), input));
        this.snapshot = JSON.stringify(this.form);
        this.toast.success('Dodano klienta.');
        void this.router.navigate(['/sklep', this.ctx.tenantId(), 'klienci', created.id], { replaceUrl: true });
      }
      this.allTags.reload();
    } catch (e) {
      const err = ApiError.from(e);
      if (err.code === 'EMAIL_TAKEN' || err.code === 'INVALID_EMAIL' || err.code === 'EMAIL_IS_LOGIN') this.emailError.set(err.message);
      else this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  private load(c: Customer): void {
    this.current.set(c);
    const a = c.address;
    this.form = {
      firstName: c.firstName ?? '', lastName: c.lastName ?? '', email: c.email, phone: c.phone ?? '', acceptsMarketing: c.acceptsMarketing,
      note: c.note ?? '', tags: [...c.tags], hasAddress: !!a.line1, company: a.company ?? '', line1: a.line1 ?? '', line2: a.line2 ?? '',
      postalCode: a.postalCode ?? '', city: a.city ?? '', countryCode: a.countryCode ?? 'PL',
    };
    this.snapshot = JSON.stringify(this.form);
    this.touch();
  }
}
