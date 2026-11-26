import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { money } from '../core/format';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { OrderConfirmation, StorefrontApi } from '../storefront-api';
import { ORDER_TOKEN_KEY } from './checkout.page';

@Component({
  selector: 'sf-confirmation',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container max-w-2xl py-12">
      @if (order(); as o) {
        <p class="text-[14px] font-medium text-sf-success">Zamówienie przyjęte</p>
        <h1 class="mt-1 text-[30px] font-semibold tracking-tight">Dziękujemy! Zamówienie nr {{ o.number }}</h1>
        <p class="mt-3 text-sf-muted">Potwierdzenie wysłaliśmy e-mailem.</p>
        @if (o.paymentMethod === 'ONLINE') {
          <section class="sf-panel mt-6 p-5" aria-labelledby="online-pay" aria-live="polite">
            <h2 id="online-pay" class="text-[17px] font-semibold">Płatność online</h2>
            @if (o.paymentStatus === 'PAID') {
              <p class="mt-2 font-medium text-sf-success">Płatność otrzymana — dziękujemy!</p>
            } @else if (o.status === 'CANCELED') {
              <p class="mt-2">Zamówienie zostało anulowane.</p>
            } @else if (waiting()) {
              <p class="mt-2">Czekamy na potwierdzenie płatności od operatora… To zwykle trwa kilka sekund.</p>
            } @else {
              <p class="mt-2">Zamówienie nie jest jeszcze opłacone. Jeśli płatność się nie udała albo została przerwana, możesz spróbować ponownie.
                Nieopłacone zamówienie zostanie anulowane po 24 godzinach.</p>
              @if (payError(); as e) {<p class="mt-2 text-[14px] text-sf-danger" role="alert">{{ e }}</p>}
              <button type="button" class="sf-btn mt-4" [disabled]="paying()" (click)="pay()">{{ paying() ? 'Przekierowanie…' : 'Zapłać ' + fmt(o.totalMinor, o.currency) }}</button>
            }
          </section>
        }
        @if (o.bankTransfer; as b) {
          <section class="sf-panel mt-6 p-5" aria-labelledby="pay">
            <h2 id="pay" class="text-[17px] font-semibold">Dane do przelewu</h2>
            <dl class="mt-3 grid gap-2 text-[14px] sm:grid-cols-[160px_1fr]">
              <dt class="text-sf-muted">Odbiorca</dt><dd>{{ b.bankAccountHolder }}</dd>
              <dt class="text-sf-muted">Numer rachunku</dt><dd class="font-medium tabular-nums">{{ iban(b.bankAccountNumber) }}</dd>
              @if (b.bankName) {<dt class="text-sf-muted">Bank</dt><dd>{{ b.bankName }}</dd>}
              <dt class="text-sf-muted">Tytuł</dt><dd>Zamówienie {{ o.number }}</dd>
              <dt class="text-sf-muted">Kwota</dt><dd class="font-semibold">{{ fmt(o.totalMinor, o.currency) }}</dd>
            </dl>
            <p class="mt-3 text-[13px] text-sf-muted">Nieopłacone zamówienie zostanie anulowane po {{ b.unpaidCancelDays }} dniach.</p>
          </section>
        }
        <ul class="mt-6 divide-y divide-sf-line border-y border-sf-line text-[14px]">
          @for (i of o.items; track $index) {
            <li class="flex justify-between gap-3 py-3"><span>{{ i.quantity }} × {{ i.name }}@if (i.variantTitle) { ({{ i.variantTitle }})}</span><span class="tabular-nums">{{ fmt(i.lineTotalMinor, o.currency) }}</span></li>
          }
        </ul>
        <dl class="mt-4 space-y-1 text-[14px]">
          @if (o.shippingMethodName) {<div class="flex justify-between"><dt>Dostawa: {{ o.shippingMethodName }}</dt><dd>{{ fmt(o.shippingMinor, o.currency) }}</dd></div>}
          @if (o.paymentFeeMinor) {<div class="flex justify-between"><dt>Opłata za pobranie</dt><dd>{{ fmt(o.paymentFeeMinor, o.currency) }}</dd></div>}
          <div class="flex justify-between text-[17px] font-semibold"><dt>Razem</dt><dd>{{ fmt(o.totalMinor, o.currency) }}</dd></div>
        </dl>
      } @else if (missing()) {
        <h1 class="text-[28px] font-semibold">Dziękujemy za zamówienie</h1>
        <p class="mt-3 text-sf-muted">Szczegóły zamówienia znajdziesz w wiadomości e-mail.</p>
      }
      <a routerLink="/" class="sf-btn mt-8">Wróć do sklepu</a>
    </div>
  `,
})
export class ConfirmationPage {
  private readonly api = inject(StorefrontApi);
  protected readonly order = signal<OrderConfirmation | null>(null);
  protected readonly missing = signal(false);
  protected readonly waiting = signal(false);
  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);
  private token: string | null = null;

  constructor() {
    inject(Seo).set({ title: 'Potwierdzenie zamówienia', path: '/zamowienie/potwierdzenie', noindex: true }, inject(StoreState).store()?.name ?? '');
    void this.load();
  }

  private async load(): Promise<void> {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(ORDER_TOKEN_KEY);
    } catch {
      token = null;
    }
    if (!token) {
      this.missing.set(true);
      return;
    }
    this.token = token;
    try {
      this.order.set(await firstValueFrom(this.api.orderStatus(token)));
    } catch {
      this.missing.set(true);
      return;
    }
    // Back from the operator: the notification usually arrives within seconds — check a few times before offering a retry.
    const o = this.order();
    if (o?.paymentMethod === 'ONLINE' && o.paymentStatus === 'UNPAID' && o.status !== 'CANCELED') {
      this.waiting.set(true);
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const next = await firstValueFrom(this.api.orderStatus(token));
          this.order.set(next);
          if (next.paymentStatus !== 'UNPAID' || next.status === 'CANCELED') break;
        } catch {
          break;
        }
      }
      this.waiting.set(false);
    }
  }

  protected async pay(): Promise<void> {
    if (!this.token) return;
    this.paying.set(true);
    this.payError.set(null);
    try {
      const r = await firstValueFrom(this.api.payOrder(this.token));
      window.location.assign(r.redirectUrl);
    } catch (e) {
      const detail = (e as { error?: { detail?: string } }).error?.detail;
      this.payError.set(detail ?? 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.');
      this.paying.set(false);
    }
  }

  protected fmt(v: number, c: string): string {
    return money(v, c);
  }

  protected iban(v: string): string {
    const digits = v.startsWith('PL') ? v.slice(2) : v;
    return digits.replace(/^(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5 $6 $7');
  }
}
