import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi, OrdersApi } from '@shopivo/api-client';
import { OrderPaymentMethod, PAYMENT_METHOD_LABELS, ProductRow } from '@shopivo/shared-models';
import {
  AlertComponent, ButtonComponent, CardComponent, FieldComponent, LoadingComponent, MoneyPipe, SelectComponent, SelectOption,
  ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface Line { variantId: string; name: string; title: string; unitMinor: number; quantity: number; available: number | null; }

/** Order taken by phone/e-mail. Prices, stock and totals are computed by the server, exactly as for the storefront. */
@Component({
  selector: 'sv-order-new-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, CardComponent, ButtonComponent, AlertComponent, FieldComponent, LoadingComponent,
    SelectComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (ngSubmit)="save()" novalidate>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <a sv-button variant="ghost" size="icon" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia']" aria-label="Wróć do zamówień"><svg [lucideIcon]="icons.arrowLeft" /></a>
          <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-ink">Nowe zamówienie</h1>
        </div>
        <button sv-button type="submit" [loading]="saving()" [disabled]="!lines().length">Utwórz zamówienie</button>
      </div>
      @if (error(); as e) {<sv-alert tone="error" class="mt-5">{{ e }}</sv-alert>}

      <div class="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="min-w-0 space-y-4">
          <sv-card heading="Produkty">
            <div class="relative">
              <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input class="sv-input pl-9" name="search" type="search" placeholder="Szukaj produktu po nazwie lub SKU…" aria-label="Szukaj produktu"
                [ngModel]="query()" (ngModelChange)="query.set($event)" autocomplete="off" />
            </div>
            @if (query().trim().length >= 2) {
              @if (results.isLoading()) {
                <sv-loading />
              } @else {
                <ul class="mt-2 max-h-64 overflow-y-auto rounded-[var(--radius-control)] border border-line">
                  @for (p of results.value()?.items; track p.id) {
                    <li class="border-b border-line last:border-b-0">
                      <button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] hover:bg-hover" (click)="pick(p)">
                        <span class="min-w-0"><span class="block truncate font-medium text-ink">{{ p.name }}</span>
                          <span class="text-ink-muted">{{ p.variantCount > 1 ? p.variantCount + ' wariantów' : (p.sku || '') }}</span></span>
                        <span class="shrink-0 tabular-nums text-ink-soft">{{ p.minPriceMinor | svMoney }}</span>
                      </button>
                    </li>
                  } @empty {
                    <li class="px-3 py-2.5 text-[13px] text-ink-muted">Brak aktywnych produktów.</li>
                  }
                </ul>
              }
            }
            @if (lines().length) {
              <div class="-mx-5 mt-4 overflow-x-auto border-t border-line px-5 pt-2">
                <table class="sv-table min-w-[520px]">
                  <thead><tr><th scope="col">Produkt</th><th scope="col" class="text-right">Cena</th><th scope="col">Ilość</th><th scope="col" class="text-right">Razem</th><th scope="col"><span class="sr-only">Usuń</span></th></tr></thead>
                  <tbody>
                    @for (l of lines(); track l.variantId; let i = $index) {
                      <tr>
                        <td><p class="font-medium text-ink">{{ l.name }}</p>@if (l.title) {<p class="text-[12px] text-ink-muted">{{ l.title }}</p>}
                          @if (l.available !== null) {<p class="text-[11px] text-ink-muted">dostępne: {{ l.available }}</p>}</td>
                        <td class="text-right tabular-nums">{{ l.unitMinor | svMoney }}</td>
                        <td><input class="sv-input !h-9 w-20" type="number" min="1" max="999" [name]="'q' + i" [attr.aria-label]="'Ilość ' + l.name"
                          [ngModel]="l.quantity" (ngModelChange)="setQty(i, $event)" /></td>
                        <td class="text-right font-medium tabular-nums">{{ l.unitMinor * l.quantity | svMoney }}</td>
                        <td class="text-right"><button sv-button type="button" variant="ghost" size="icon" [attr.aria-label]="'Usuń ' + l.name" (click)="remove(i)"><svg [lucideIcon]="icons.trash" /></button></td>
                      </tr>
                    }
                  </tbody>
                </table>
                <p class="py-3 text-right text-[13px] text-ink-soft">Produkty: <strong class="text-ink tabular-nums">{{ subtotal() | svMoney }}</strong> · dostawę i sumę wyliczy system</p>
              </div>
            }
            @if (variantPick(); as vp) {
              <div class="mt-3 rounded-[var(--radius-control)] bg-canvas p-3">
                <p class="text-[13px] font-medium text-ink">Wybierz wariant: {{ vp.name }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  @for (v of vp.variants; track v.id) {
                    <button sv-button type="button" size="sm" variant="secondary" (click)="addVariant(vp.name, v.id, v.title, v.priceMinor, v.available)">
                      {{ v.title }} · {{ v.priceMinor | svMoney }}</button>
                  }
                </div>
              </div>
            }
          </sv-card>

          <sv-card heading="Klient i adres dostawy">
            <div class="grid gap-4 sm:grid-cols-2">
              <sv-field label="Imię" for="fn"><input id="fn" name="fn" class="sv-input" maxlength="100" [(ngModel)]="c.firstName" /></sv-field>
              <sv-field label="Nazwisko" for="ln"><input id="ln" name="ln" class="sv-input" maxlength="100" [(ngModel)]="c.lastName" /></sv-field>
              <sv-field label="E-mail" for="em"><input id="em" name="em" type="email" class="sv-input" maxlength="320" [(ngModel)]="c.email" /></sv-field>
              <sv-field label="Telefon" for="ph" [optional]="true"><input id="ph" name="ph" type="tel" class="sv-input" maxlength="30" [(ngModel)]="c.phone" /></sv-field>
              <sv-field label="Ulica i numer" for="l1" class="sm:col-span-2"><input id="l1" name="l1" class="sv-input" maxlength="200" [(ngModel)]="c.line1" /></sv-field>
              <sv-field label="Kod pocztowy" for="pc"><input id="pc" name="pc" class="sv-input" maxlength="6" placeholder="00-000" [(ngModel)]="c.postalCode" /></sv-field>
              <sv-field label="Miejscowość" for="ci"><input id="ci" name="ci" class="sv-input" maxlength="100" [(ngModel)]="c.city" /></sv-field>
              <sv-field label="Uwagi" for="nt" [optional]="true" class="sm:col-span-2"><input id="nt" name="nt" class="sv-input" maxlength="1000" [(ngModel)]="c.note" /></sv-field>
            </div>
            <label class="mt-4 flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="inv" [(ngModel)]="c.invoice" />Faktura na firmę</label>
            @if (c.invoice) {
              <div class="mt-3 grid gap-4 sm:grid-cols-2">
                <sv-field label="Nazwa firmy" for="co"><input id="co" name="co" class="sv-input" maxlength="200" [(ngModel)]="c.company" /></sv-field>
                <sv-field label="NIP" for="nip"><input id="nip" name="nip" class="sv-input" maxlength="20" [(ngModel)]="c.nip" /></sv-field>
              </div>
            }
          </sv-card>
        </div>

        <div class="min-w-0 space-y-4">
          <sv-card heading="Dostawa i płatność">
            <div class="space-y-4">
              <sv-field label="Sposób dostawy" for="sm">
                <sv-select inputId="sm" name="sm" [options]="shippingOptions()" [(ngModel)]="c.shippingMethodId" ariaLabel="Sposób dostawy" />
              </sv-field>
              @if (!shipping.isLoading() && !shipping.value()?.length) {
                <p class="text-[12px] text-ink-muted">Brak metod dostawy. <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'wysylka']">Dodaj je</a>.</p>
              }
              <sv-field label="Płatność" for="pm">
                <sv-select inputId="pm" name="pm" [options]="paymentOptions" [(ngModel)]="c.paymentMethod" ariaLabel="Płatność" />
              </sv-field>
            </div>
          </sv-card>
        </div>
      </div>
    </form>
  `,
})
export class OrderNewPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;

  protected readonly query = signal('');
  protected readonly lines = signal<Line[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly variantPick = signal<{ name: string; variants: { id: string; title: string; priceMinor: number; available: number | null }[] } | null>(null);
  protected readonly paymentOptions: SelectOption[] = (['MANUAL', 'BANK_TRANSFER', 'COD'] as OrderPaymentMethod[])
    .map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));
  protected c = { firstName: '', lastName: '', email: '', phone: '', line1: '', postalCode: '', city: '', note: '', invoice: false,
    company: '', nip: '', shippingMethodId: '', paymentMethod: 'MANUAL' as OrderPaymentMethod };

  protected readonly results = rxResource({
    params: () => (this.query().trim().length >= 2 ? { t: this.ctx.tenantId(), q: this.query() } : undefined),
    stream: ({ params }) => this.catalog.products(params.t, { q: params.q, status: 'ACTIVE', page: 0, size: 8 }),
  });
  protected readonly shipping = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.shippingMethods(params) });
  protected readonly shippingOptions = computed<SelectOption[]>(() => [{ value: '', label: 'Bez dostawy (produkty cyfrowe)' },
    ...(this.shipping.value() ?? []).filter((m) => m.active && m.type !== 'DIGITAL').map((m) => ({ value: m.id, label: m.name }))]);
  protected readonly subtotal = computed(() => this.lines().reduce((s, l) => s + l.unitMinor * l.quantity, 0));

  protected async pick(p: ProductRow): Promise<void> {
    try {
      const full = await firstValueFrom(this.catalog.product(this.ctx.tenantId(), p.id));
      this.query.set('');
      if (full.variants.length === 1) {
        const v = full.variants[0];
        this.addVariant(full.name, v.id, '', v.priceMinor, v.trackInventory && !v.allowBackorder ? v.available : null);
      } else {
        this.variantPick.set({ name: full.name, variants: full.variants.map((v) => ({ id: v.id, title: v.title, priceMinor: v.priceMinor,
          available: v.trackInventory && !v.allowBackorder ? v.available : null })) });
      }
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected addVariant(name: string, variantId: string, title: string, unitMinor: number, available: number | null): void {
    this.variantPick.set(null);
    const existing = this.lines().findIndex((l) => l.variantId === variantId);
    if (existing >= 0) {
      this.setQty(existing, this.lines()[existing].quantity + 1);
      return;
    }
    this.lines.update((ls) => [...ls, { variantId, name, title, unitMinor, quantity: 1, available }]);
  }

  protected setQty(i: number, q: number | string): void {
    const n = Math.min(999, Math.max(1, Math.round(Number(q) || 1)));
    this.lines.update((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: n } : l)));
  }

  protected remove(i: number): void {
    this.lines.update((ls) => ls.filter((_, j) => j !== i));
  }

  protected async save(): Promise<void> {
    const c = this.c;
    this.saving.set(true);
    this.error.set(null);
    try {
      const hasAddress = !!c.line1.trim();
      const order = await firstValueFrom(this.api.create(this.ctx.tenantId(),
        this.lines().map((l) => ({ variantId: l.variantId, quantity: l.quantity })), {
          email: c.email.trim(), phone: c.phone.trim() || null, firstName: c.firstName.trim(), lastName: c.lastName.trim(),
          shippingAddress: hasAddress ? { name: `${c.firstName} ${c.lastName}`.trim(), company: null, line1: c.line1.trim(), line2: null,
            postalCode: c.postalCode.trim(), city: c.city.trim(), countryCode: 'PL', phone: c.phone.trim() || null } : null,
          billing: c.invoice ? { invoice: true, companyName: c.company.trim(), taxId: c.nip.trim(), address: null } : null,
          shippingMethodId: c.shippingMethodId || null, paymentMethod: c.paymentMethod, customerNote: c.note.trim() || null,
          termsAccepted: false, marketingConsent: false,
        }));
      this.toast.success(`Utworzono zamówienie #${order.number}.`);
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'zamowienia', order.id]);
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
