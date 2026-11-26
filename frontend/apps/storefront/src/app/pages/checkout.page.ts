import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CartState } from '../core/cart';
import { money } from '../core/format';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';

export const ORDER_TOKEN_KEY = 'shopivo.lastOrder';

/** Guest checkout. All validation is repeated on the server; the form only helps the customer. */
@Component({
  selector: 'sf-checkout',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      <h1 class="text-[30px] font-semibold tracking-tight">Zamówienie</h1>
      @if (!cart.cart()?.lines?.length) {
        <p class="mt-6 text-sf-muted">Koszyk jest pusty.</p>
        <a routerLink="/produkty" class="sf-btn mt-6">Przeglądaj produkty</a>
      } @else {
        <form class="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]" (ngSubmit)="submit()" novalidate>
          <div class="space-y-8">
            <fieldset class="space-y-4">
              <legend class="text-[18px] font-semibold">Dane kontaktowe</legend>
              <div class="grid gap-4 sm:grid-cols-2">
                <div><label class="sf-label" for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" class="sf-input" required [(ngModel)]="f.email" [attr.aria-invalid]="invalid('email')" /></div>
                <div><label class="sf-label" for="phone">Telefon</label><input id="phone" name="phone" type="tel" autocomplete="tel" class="sf-input" [(ngModel)]="f.phone" /></div>
                <div><label class="sf-label" for="fn">Imię</label><input id="fn" name="fn" autocomplete="given-name" class="sf-input" required [(ngModel)]="f.firstName" [attr.aria-invalid]="invalid('firstName')" /></div>
                <div><label class="sf-label" for="ln">Nazwisko</label><input id="ln" name="ln" autocomplete="family-name" class="sf-input" required [(ngModel)]="f.lastName" [attr.aria-invalid]="invalid('lastName')" /></div>
              </div>
            </fieldset>

            @if (needsShipping()) {
              <fieldset class="space-y-4">
                <legend class="text-[18px] font-semibold">Adres dostawy</legend>
                <div><label class="sf-label" for="l1">Ulica i numer</label><input id="l1" name="l1" autocomplete="address-line1" class="sf-input" [(ngModel)]="f.line1" [attr.aria-invalid]="invalid('line1')" /></div>
                <div class="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <div><label class="sf-label" for="pc">Kod pocztowy</label><input id="pc" name="pc" autocomplete="postal-code" class="sf-input" placeholder="00-000" maxlength="6" [(ngModel)]="f.postalCode" [attr.aria-invalid]="invalid('postalCode')" /></div>
                  <div><label class="sf-label" for="city">Miejscowość</label><input id="city" name="city" autocomplete="address-level2" class="sf-input" [(ngModel)]="f.city" [attr.aria-invalid]="invalid('city')" /></div>
                </div>
              </fieldset>

              <fieldset>
                <legend class="text-[18px] font-semibold">Dostawa</legend>
                <div class="mt-3 space-y-2">
                  @if (options.error()) {<p class="text-[14px] text-sf-danger" role="alert">Nie udało się pobrać metod dostawy i płatności. Odśwież stronę.</p>}
                  @for (m of opts()?.shippingMethods; track m.id) {
                    <label class="sf-panel flex cursor-pointer items-center gap-3 px-4 py-3.5" [style.border-color]="f.shippingMethodId === m.id ? 'var(--sf-primary)' : ''">
                      <input type="radio" name="shipping" class="sf-check" [value]="m.id" [(ngModel)]="f.shippingMethodId" />
                      <span class="flex-1"><span class="font-medium">{{ m.name }}</span>@if (m.description) {<span class="block text-[13px] text-sf-muted">{{ m.description }}</span>}</span>
                      <span class="font-medium tabular-nums">{{ shippingPrice(m.priceMinor, m.freeFromMinor) === 0 ? 'Gratis' : fmt(shippingPrice(m.priceMinor, m.freeFromMinor)) }}</span>
                    </label>
                  } @empty {<p class="text-sf-muted">Brak dostępnych sposobów dostawy.</p>}
                </div>
              </fieldset>
            }

            <fieldset>
              <legend class="text-[18px] font-semibold">Płatność</legend>
              <div class="mt-3 space-y-2">
                @for (p of availablePayments(); track p.method) {
                  <label class="sf-panel flex cursor-pointer items-center gap-3 px-4 py-3.5" [style.border-color]="f.paymentMethod === p.method ? 'var(--sf-primary)' : ''">
                    <input type="radio" name="payment" class="sf-check" [value]="p.method" [(ngModel)]="f.paymentMethod" />
                    <span class="flex-1 font-medium">{{ p.label }}</span>
                    @if (p.feeMinor) {<span class="tabular-nums">+ {{ fmt(p.feeMinor) }}</span>}
                  </label>
                } @empty {<p class="text-sf-muted">Brak dostępnych metod płatności.</p>}
              </div>
            </fieldset>

            <fieldset class="space-y-4">
              <legend class="text-[18px] font-semibold">Faktura i uwagi</legend>
              <label class="flex items-center gap-2.5"><input type="checkbox" class="sf-check" name="inv" [(ngModel)]="f.invoice" />Chcę fakturę na firmę</label>
              @if (f.invoice) {
                <div class="grid gap-4 sm:grid-cols-2">
                  <div><label class="sf-label" for="co">Nazwa firmy</label><input id="co" name="co" autocomplete="organization" class="sf-input" [(ngModel)]="f.company" [attr.aria-invalid]="invalid('company')" /></div>
                  <div><label class="sf-label" for="nip">NIP</label><input id="nip" name="nip" class="sf-input" inputmode="numeric" [(ngModel)]="f.nip" [attr.aria-invalid]="invalid('nip')" /></div>
                </div>
              }
              <div><label class="sf-label" for="note">Uwagi do zamówienia</label><textarea id="note" name="note" class="sf-input !h-24 py-2.5" maxlength="1000" [(ngModel)]="f.note"></textarea></div>
            </fieldset>
          </div>

          <aside class="sf-panel h-fit p-5 lg:sticky lg:top-24">
            <h2 class="text-[17px] font-semibold">Podsumowanie</h2>
            <ul class="mt-3 space-y-2 text-[14px]">
              @for (l of cart.cart()!.lines; track l.variantId) {
                <li class="flex justify-between gap-3"><span class="min-w-0">{{ l.quantity }} × {{ l.name }}@if (l.variantTitle) {<span class="text-sf-muted"> ({{ l.variantTitle }})</span>}</span><span class="shrink-0 tabular-nums">{{ fmt(l.lineTotalMinor) }}</span></li>
              }
            </ul>
            <dl class="mt-4 space-y-1.5 border-t border-sf-line pt-4 text-[14px]">
              <div class="flex justify-between"><dt>Produkty</dt><dd class="tabular-nums">{{ fmt(subtotal()) }}</dd></div>
              @if (needsShipping()) {<div class="flex justify-between"><dt>Dostawa</dt><dd class="tabular-nums">{{ selectedShipping() === null ? '—' : fmt(selectedShipping()!) }}</dd></div>}
              @if (fee()) {<div class="flex justify-between"><dt>Opłata za pobranie</dt><dd class="tabular-nums">{{ fmt(fee()) }}</dd></div>}
              <div class="flex justify-between border-t border-sf-line pt-2 text-[17px] font-semibold"><dt>Do zapłaty</dt><dd class="tabular-nums">{{ fmt(total()) }}</dd></div>
            </dl>
            <div class="mt-5 space-y-3 text-[13px]">
              <label class="flex items-start gap-2.5"><input type="checkbox" class="sf-check mt-0.5" name="terms" [(ngModel)]="f.terms" [attr.aria-invalid]="invalid('terms')" />
                <span>Akceptuję
                  @if (legal('TERMS'); as t) {<a class="sf-link" [href]="t" target="_blank" rel="noopener">regulamin sklepu</a>} @else {regulamin sklepu}
                  i zapoznałem(-am) się z informacją o prawie odstąpienia od umowy.
                  @if (legal('PRIVACY'); as p) {Dane przetwarzamy zgodnie z <a class="sf-link" [href]="p" target="_blank" rel="noopener">polityką prywatności</a>.}
                </span></label>
              <label class="flex items-start gap-2.5"><input type="checkbox" class="sf-check mt-0.5" name="mkt" [(ngModel)]="f.marketing" />
                <span>Chcę otrzymywać informacje o nowościach i promocjach e-mailem (zgodę możesz wycofać w każdej chwili).</span></label>
            </div>
            @if (error(); as e) {<p class="mt-4 text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
            <button type="submit" class="sf-btn mt-5 w-full" [disabled]="submitting()">{{ submitting() ? 'Składanie zamówienia…' : 'Zamawiam i płacę' }}</button>
            <p class="mt-3 text-center text-[12px] text-sf-muted">Kliknięcie oznacza zamówienie z obowiązkiem zapłaty.</p>
          </aside>
        </form>
      }
    </div>
  `,
})
export class CheckoutPage {
  protected readonly cart = inject(CartState);
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly router = inject(Router);
  protected readonly options = rxResource({ stream: () => this.api.checkoutOptions() });
  /** Links to the store's published legal documents (opened in a new tab so the form is not lost). */
  protected legal(key: 'TERMS' | 'PRIVACY'): string | null {
    return this.store.store()?.footerLinks.find((l) => l.systemKey === key)?.path ?? null;
  }
  protected readonly opts = computed(() => (this.options.hasValue() ? this.options.value() : undefined));
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly touched = signal(false);
  protected f = { email: '', phone: '', firstName: '', lastName: '', line1: '', postalCode: '', city: '', shippingMethodId: '',
    paymentMethod: '' as '' | 'BANK_TRANSFER' | 'COD', invoice: false, company: '', nip: '', note: '', terms: false, marketing: false };

  /** Digital-only carts need no address or shipping. Cart lines do not carry the type, so the server decides; assume shipping. */
  protected readonly needsShipping = computed(() => (this.opts()?.shippingMethods.length ?? 0) > 0);
  protected readonly availablePayments = computed(() => this.opts()?.paymentMethods ?? []);
  protected readonly subtotal = computed(() => this.cart.cart()?.subtotalMinor ?? 0);

  constructor() {
    inject(Seo).set({ title: 'Zamówienie', path: '/zamowienie', noindex: true }, this.store.store()?.name ?? '');
    void this.cart.refresh();
  }

  protected fmt(v: number): string {
    return money(v, this.cart.cart()?.currency);
  }

  protected shippingPrice(price: number, freeFrom: number | null): number {
    return freeFrom !== null && this.subtotal() >= freeFrom ? 0 : price;
  }

  protected selectedShipping(): number | null {
    const m = this.opts()?.shippingMethods.find((x) => x.id === this.f.shippingMethodId);
    return m ? this.shippingPrice(m.priceMinor, m.freeFromMinor) : null;
  }

  protected fee(): number {
    return this.availablePayments().find((p) => p.method === this.f.paymentMethod)?.feeMinor ?? 0;
  }

  protected total(): number {
    return this.subtotal() + (this.selectedShipping() ?? 0) + this.fee();
  }

  protected invalid(field: string): boolean | null {
    if (!this.touched()) return null;
    const f = this.f;
    switch (field) {
      case 'email': return !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim());
      case 'firstName': return !f.firstName.trim();
      case 'lastName': return !f.lastName.trim();
      case 'line1': return this.needsShipping() && !f.line1.trim();
      case 'postalCode': return this.needsShipping() && !/^\d{2}-\d{3}$/.test(f.postalCode.trim());
      case 'city': return this.needsShipping() && !f.city.trim();
      case 'company': return f.invoice && !f.company.trim();
      case 'nip': return f.invoice && f.nip.replace(/\D/g, '').length !== 10;
      case 'terms': return !f.terms;
      default: return null;
    }
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    const fields = ['email', 'firstName', 'lastName', 'line1', 'postalCode', 'city', 'company', 'nip', 'terms'];
    if (fields.some((x) => this.invalid(x))) {
      this.error.set('Uzupełnij zaznaczone pola i zaakceptuj regulamin.');
      return;
    }
    if (this.needsShipping() && !this.f.shippingMethodId) {
      this.error.set('Wybierz sposób dostawy.');
      return;
    }
    if (!this.f.paymentMethod) {
      this.error.set('Wybierz metodę płatności.');
      return;
    }
    const token = this.cart.currentToken();
    if (!token) return;
    const f = this.f;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.checkout(token, {
        email: f.email.trim(), phone: f.phone.trim() || null, firstName: f.firstName.trim(), lastName: f.lastName.trim(),
        shippingAddress: this.needsShipping() ? { name: `${f.firstName} ${f.lastName}`.trim(), company: f.invoice ? f.company.trim() : null,
          line1: f.line1.trim(), line2: null, postalCode: f.postalCode.trim(), city: f.city.trim(), countryCode: 'PL', phone: f.phone.trim() || null } : null,
        billing: f.invoice ? { invoice: true, companyName: f.company.trim(), taxId: f.nip.trim(), address: null } : null,
        shippingMethodId: this.needsShipping() ? f.shippingMethodId : null, paymentMethod: f.paymentMethod as 'BANK_TRANSFER' | 'COD',
        customerNote: f.note.trim() || null, termsAccepted: f.terms, marketingConsent: f.marketing,
      }));
      try {
        sessionStorage.setItem(ORDER_TOKEN_KEY, result.orderToken);
      } catch {
        // without storage the confirmation page shows a generic message
      }
      this.cart.clear();
      await this.router.navigate(['/zamowienie/potwierdzenie']);
    } catch (e: unknown) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'Nie udało się złożyć zamówienia. Spróbuj ponownie.');
      await this.cart.refresh();
    } finally {
      this.submitting.set(false);
    }
  }
}
