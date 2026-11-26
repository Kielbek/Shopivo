import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { CustomerSession, apiMessage } from '../core/account';
import { firstValueFrom } from 'rxjs';
import { money } from '../core/format';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { ORDER_STATUS, PAYMENT_STATUS } from './account.page';

@Component({
  selector: 'sf-account-order',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container max-w-[760px] py-10">
      <a routerLink="/konto" class="sf-link text-[14px]">← Moje konto</a>
      @if (order.error()) {
        <p class="mt-6">Nie znaleziono zamówienia.</p>
      } @else if (o(); as o) {
        <h1 class="mt-3 text-[28px] font-semibold tracking-tight">Zamówienie nr {{ o.number }}</h1>
        <p class="mt-1 text-sf-muted">{{ date(o.createdAt) }} · {{ status[o.status] }} · {{ payment[o.paymentStatus] }}</p>
        @if (o.paymentMethod === 'ONLINE' && o.paymentStatus === 'UNPAID' && o.status !== 'CANCELED') {
          <div class="sf-panel mt-4 p-4">
            <p>Zamówienie czeka na płatność online.</p>
            @if (payError(); as e) {<p class="mt-2 text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
            <button type="button" class="sf-btn mt-3" [disabled]="paying()" (click)="pay(o.number)">{{ paying() ? 'Przekierowanie…' : 'Zapłać ' + fmt(o.totalMinor) }}</button>
          </div>
        }
        @if (o.trackingNumber) {<p class="mt-2">Numer przesyłki: <strong class="font-semibold">{{ o.trackingNumber }}</strong></p>}
        <ul class="sf-panel mt-6 divide-y divide-sf-line">
          @for (i of o.items; track $index) {
            <li class="flex justify-between gap-4 px-5 py-3 text-[14px]">
              <span>{{ i.quantity }} × {{ i.name }}@if (i.variantTitle) { <span class="text-sf-muted">({{ i.variantTitle }})</span>}</span>
              <span class="tabular-nums">{{ fmt(i.lineTotalMinor) }}</span>
            </li>
          }
        </ul>
        <dl class="mt-4 space-y-1 text-[14px]">
          <div class="flex justify-between"><dt class="text-sf-muted">Produkty</dt><dd class="tabular-nums">{{ fmt(o.subtotalMinor) }}</dd></div>
          @if (o.shippingMethodName) {<div class="flex justify-between"><dt class="text-sf-muted">Dostawa: {{ o.shippingMethodName }}</dt><dd class="tabular-nums">{{ fmt(o.shippingMinor) }}</dd></div>}
          @if (o.paymentFeeMinor) {<div class="flex justify-between"><dt class="text-sf-muted">Opłata za pobranie</dt><dd class="tabular-nums">{{ fmt(o.paymentFeeMinor) }}</dd></div>}
          <div class="flex justify-between border-t border-sf-line pt-2 text-[16px] font-semibold"><dt>Razem</dt><dd class="tabular-nums">{{ fmt(o.totalMinor) }}</dd></div>
        </dl>
        @if (o.shippingAddress; as a) {
          <h2 class="mt-8 text-[17px] font-semibold">Adres dostawy</h2>
          <address class="mt-2 not-italic leading-relaxed">{{ a.name }}<br />{{ a.line1 }}@if (a.line2) {<br />{{ a.line2 }}}<br />{{ a.postalCode }} {{ a.city }}</address>
        }
        @if (o.status === 'COMPLETED') {<a [routerLink]="['/konto']" [queryParams]="{ zakladka: 'opinie' }" class="sf-btn-outline mt-8">Oceń produkty</a>}
      } @else {
        <p class="mt-6 text-sf-muted" aria-busy="true">Wczytywanie…</p>
      }
    </div>
  `,
})
export class AccountOrderPage {
  private readonly session = inject(CustomerSession);
  readonly numer = input.required<string>();
  protected readonly status = ORDER_STATUS;
  protected readonly payment = PAYMENT_STATUS;
  protected readonly order = rxResource({
    params: () => (this.session.account() ? Number(this.numer()) : undefined),
    stream: ({ params }) => this.session.order(params),
  });
  protected readonly o = computed(() => (this.order.hasValue() ? this.order.value() : undefined));

  constructor() {
    inject(Seo).set({ title: 'Zamówienie', path: '/konto', noindex: true }, inject(StoreState).store()?.name ?? '');
    const router = inject(Router);
    void this.session.load().then(() => {
      if (!this.session.account()) void router.navigate(['/konto/logowanie'], { queryParams: { powrot: router.url }, replaceUrl: true });
    });
  }

  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);

  protected async pay(number: number): Promise<void> {
    this.paying.set(true);
    this.payError.set(null);
    try {
      const r = await firstValueFrom(this.session.payOrder(number));
      // The operator returns to the confirmation page; it must not show a different order from this tab's session.
      try {
        sessionStorage.removeItem('shopivo.lastOrder');
      } catch {
        // ignore
      }
      window.location.assign(r.redirectUrl);
    } catch (e) {
      this.payError.set(apiMessage(e));
      this.paying.set(false);
    }
  }

  protected fmt(minor: number): string {
    return money(minor);
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  }
}
