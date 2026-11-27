import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { CustomerOrder, CustomerReturn, CustomerSession, Reviewable, SavedAddress, apiMessage } from '../core/account';
import { money } from '../core/format';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';

type Tab = 'zamowienia' | 'zwroty' | 'opinie' | 'adresy' | 'ustawienia';

export const ORDER_STATUS: Record<string, string> = {
  NEW: 'Przyjęte', PROCESSING: 'W realizacji', SHIPPED: 'Wysłane', COMPLETED: 'Zrealizowane', CANCELED: 'Anulowane',
};
export const PAYMENT_STATUS: Record<string, string> = { UNPAID: 'Nieopłacone', PAID: 'Opłacone', REFUNDED: 'Zwrócone' };

const DATE = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

interface ReviewDraft { rating: number; body: string; busy: boolean; error: string | null; }
interface AddressForm { id: string | null; name: string; company: string; line1: string; line2: string; postalCode: string; city: string; phone: string; isDefault: boolean; }

/** Customer account (browser-rendered). Signed-out visitors are sent to the login page. */
@Component({
  selector: 'sf-account',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container max-w-[960px] py-10">
      @if (session.account(); as a) {
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-[28px] font-semibold tracking-tight">Cześć, {{ a.firstName }}</h1>
            <p class="mt-1 text-sf-muted">{{ a.email }}</p>
          </div>
          <button type="button" class="sf-btn-outline !h-10" (click)="logout()">Wyloguj się</button>
        </div>
        <nav class="mt-6 flex gap-1 overflow-x-auto border-b border-sf-line" aria-label="Konto">
          @for (t of tabs; track t.id) {
            <a [routerLink]="[]" [queryParams]="{ zakladka: t.id === 'zamowienia' ? null : t.id }"
              class="whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-medium"
              [class]="tab() === t.id ? 'border-sf-primary text-sf-text' : 'border-transparent text-sf-muted hover:text-sf-text'"
              [attr.aria-current]="tab() === t.id ? 'page' : null">{{ t.label }}@if (t.id === 'opinie' && toReview().length) { ({{ toReview().length }})}</a>
          }
        </nav>

        @switch (tab()) {
          @case ('zamowienia') {
            @if (orders.error()) {<p class="mt-6 text-sf-danger" role="alert">Nie udało się wczytać zamówień.</p>}
            @else if (ordersList(); as list) {
              @if (list.length) {
                <ul class="mt-6 space-y-3">
                  @for (o of list; track o.number) {
                    <li class="sf-panel flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
                      <a [routerLink]="['/konto/zamowienia', o.number]" class="font-semibold hover:underline">Zamówienie nr {{ o.number }}</a>
                      <span class="text-[13px] text-sf-muted">{{ date(o.createdAt) }}</span>
                      <span class="text-[13px]">{{ status[o.status] }} · {{ payment[o.paymentStatus] }}</span>
                      <span class="ml-auto font-medium tabular-nums">{{ fmt(o.totalMinor) }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="mt-6 text-sf-muted">Nie masz jeszcze zamówień złożonych na adres {{ a.email }}.</p>
                <a routerLink="/produkty" class="sf-btn mt-4">Przejdź do sklepu</a>
              }
            } @else {<div class="mt-6 space-y-3" role="status" aria-busy="true"><span class="sr-only">Wczytywanie…</span><span class="sf-shimmer block h-5 w-2/3 rounded-[6px]"></span><span class="sf-shimmer block h-20 rounded-[10px]"></span><span class="sf-shimmer block h-20 rounded-[10px]"></span></div>}
          }
          @case ('opinie') {
            <p class="mt-6 max-w-2xl text-[14px] text-sf-muted">Oceniać możesz produkty z Twoich zamówień, które zostały zrealizowane i opłacone.
              Opinie pojawiają się w sklepie po sprawdzeniu, z oznaczeniem „Zweryfikowany zakup”.</p>
            @if (toReview().length) {
              <ul class="mt-5 space-y-4">
                @for (r of toReview(); track r.orderNumber + r.productId) {
                  @let d = draft(r);
                  <li class="sf-panel p-5">
                    <p class="font-semibold">{{ r.name }}</p>
                    <p class="text-[12px] text-sf-muted">Zamówienie nr {{ r.orderNumber }}</p>
                    <form class="mt-3" (ngSubmit)="sendReview(r)">
                      <fieldset><legend class="sf-label">Ocena</legend>
                        <div class="flex gap-1">
                          @for (n of [1, 2, 3, 4, 5]; track n) {
                            <label class="cursor-pointer">
                              <input type="radio" class="peer sr-only" [name]="'rating-' + key(r)" [value]="n" [checked]="d.rating === n" (change)="patch(r, { rating: n, error: null })" [attr.aria-label]="n + ' na 5'" />
                              <svg viewBox="0 0 20 20" class="size-7 rounded peer-focus-visible:outline-2" aria-hidden="true"><path [attr.fill]="d.rating >= n ? '#F5A524' : '#D9DCE3'" d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" /></svg>
                            </label>
                          }
                        </div>
                      </fieldset>
                      <label class="sf-label mt-3" [for]="'rb-' + key(r)">Opinia <span class="font-normal text-sf-muted">(opcjonalnie)</span></label>
                      <textarea [id]="'rb-' + key(r)" [name]="'rb-' + key(r)" class="sf-input !h-24 py-2" maxlength="2000" [ngModel]="d.body" (ngModelChange)="patch(r, { body: $event })"></textarea>
                      @if (d.error) {<p class="mt-2 text-[14px] text-sf-danger" role="alert">{{ d.error }}</p>}
                      <button type="submit" class="sf-btn mt-3" [disabled]="d.busy">Wyślij opinię</button>
                    </form>
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-5">Nie masz produktów do oceny.</p>
            }
            @if (reviewedNow()) {<p class="mt-4 text-sf-success" role="status">Dziękujemy — opinia została przesłana do sprawdzenia.</p>}
          }
          @case ('zwroty') {
            <p class="mt-6 max-w-2xl text-[14px] text-sf-muted">Zwrot (14 dni od otrzymania) lub reklamację zgłosisz na stronie zamówienia —
              wybierz zamówienie z zakładki <a class="sf-link" routerLink="/konto">Zamówienia</a>.</p>
            @if (returns.error()) {<p class="mt-6 text-sf-danger" role="alert">Nie udało się wczytać zgłoszeń.</p>}
            @else if (returnList(); as list) {
              @if (list.length) {
                <ul class="mt-5 space-y-3">
                  @for (r of list; track r.number) {
                    <li class="sf-panel px-5 py-4">
                      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span class="font-semibold">{{ r.kind === 'WITHDRAWAL' ? 'Zwrot' : 'Reklamacja' }} nr {{ r.number }}</span>
                        <a [routerLink]="['/konto/zamowienia', r.orderNumber]" class="sf-link text-[13px]">zamówienie nr {{ r.orderNumber }}</a>
                        <span class="text-[13px] text-sf-muted">{{ date(r.createdAt) }}</span>
                        <span class="ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-medium" [class]="returnTone[r.status]">{{ returnStatus[r.status] }}</span>
                      </div>
                      <p class="mt-1.5 text-[14px]">@for (i of r.items; track i.orderItemId; let last = $last) {{{ i.quantity }} × {{ i.name }}@if (!last) {, }}</p>
                      @if (r.merchantNote) {<p class="mt-2 rounded-[8px] bg-sf-soft px-3 py-2 text-[14px]"><span class="font-medium">Sklep:</span> {{ r.merchantNote }}</p>}
                    </li>
                  }
                </ul>
              } @else {
                <p class="mt-5">Nie masz zgłoszeń zwrotów ani reklamacji.</p>
              }
            } @else {<div class="mt-6 space-y-3" role="status" aria-busy="true"><span class="sr-only">Wczytywanie…</span><span class="sf-shimmer block h-20 rounded-[10px]"></span></div>}
          }
          @case ('adresy') {
            <div class="mt-6 grid gap-4 md:grid-cols-2">
              @for (ad of addressList(); track ad.id) {
                <div class="sf-panel p-5 text-[14px]">
                  @if (ad.isDefault) {<p class="mb-1 text-[12px] font-semibold text-sf-success">Domyślny</p>}
                  <address class="not-italic leading-relaxed">{{ ad.name }}@if (ad.company) {<br />{{ ad.company }}}<br />{{ ad.line1 }}@if (ad.line2) {<br />{{ ad.line2 }}}<br />{{ ad.postalCode }} {{ ad.city }}@if (ad.phone) {<br />{{ ad.phone }}}</address>
                  <div class="mt-3 flex gap-3 text-[13px]">
                    <button type="button" class="sf-link" (click)="editAddress(ad)">Edytuj</button>
                    <button type="button" class="sf-link" (click)="removeAddress(ad)">Usuń</button>
                  </div>
                </div>
              }
            </div>
            @if (addressForm(); as f) {
              <form class="sf-panel mt-6 grid gap-3 p-5 sm:grid-cols-2" (ngSubmit)="saveAddress()">
                <h2 class="text-[17px] font-semibold sm:col-span-2">{{ f.id ? 'Edytuj adres' : 'Nowy adres' }}</h2>
                <div class="sm:col-span-2"><label class="sf-label" for="ad-name">Imię i nazwisko</label><input id="ad-name" name="name" class="sf-input" autocomplete="name" [(ngModel)]="f.name" /></div>
                <div class="sm:col-span-2"><label class="sf-label" for="ad-company">Firma <span class="font-normal text-sf-muted">(opcjonalnie)</span></label><input id="ad-company" name="company" class="sf-input" [(ngModel)]="f.company" /></div>
                <div class="sm:col-span-2"><label class="sf-label" for="ad-line1">Ulica i numer</label><input id="ad-line1" name="line1" class="sf-input" autocomplete="address-line1" [(ngModel)]="f.line1" /></div>
                <div><label class="sf-label" for="ad-postal">Kod pocztowy</label><input id="ad-postal" name="postal" class="sf-input" autocomplete="postal-code" placeholder="00-000" [(ngModel)]="f.postalCode" /></div>
                <div><label class="sf-label" for="ad-city">Miejscowość</label><input id="ad-city" name="city" class="sf-input" autocomplete="address-level2" [(ngModel)]="f.city" /></div>
                <div><label class="sf-label" for="ad-phone">Telefon <span class="font-normal text-sf-muted">(opcjonalnie)</span></label><input id="ad-phone" name="phone" class="sf-input" autocomplete="tel" [(ngModel)]="f.phone" /></div>
                <label class="flex items-center gap-2 self-end text-[14px]"><input type="checkbox" class="sf-check" name="def" [(ngModel)]="f.isDefault" />Adres domyślny</label>
                @if (addressError(); as e) {<p class="text-[14px] text-sf-danger sm:col-span-2" role="alert">{{ e }}</p>}
                <div class="flex gap-2 sm:col-span-2">
                  <button type="submit" class="sf-btn">Zapisz adres</button>
                  <button type="button" class="sf-btn-outline" (click)="addressForm.set(null)">Anuluj</button>
                </div>
              </form>
            } @else {
              <button type="button" class="sf-btn-outline mt-6" (click)="editAddress(null)">Dodaj adres</button>
            }
          }
          @case ('ustawienia') {
            <div class="mt-6 grid gap-6 md:grid-cols-2">
              <form class="sf-panel space-y-3 p-5" (ngSubmit)="saveProfile()">
                <h2 class="text-[17px] font-semibold">Dane</h2>
                <div><label class="sf-label" for="p-first">Imię</label><input id="p-first" name="first" class="sf-input" [(ngModel)]="profile.firstName" /></div>
                <div><label class="sf-label" for="p-last">Nazwisko</label><input id="p-last" name="last" class="sf-input" [(ngModel)]="profile.lastName" /></div>
                <div><label class="sf-label" for="p-phone">Telefon</label><input id="p-phone" name="phone" class="sf-input" [(ngModel)]="profile.phone" /></div>
                <button type="submit" class="sf-btn">Zapisz</button>
              </form>
              <form class="sf-panel space-y-3 p-5" (ngSubmit)="changePassword()">
                <h2 class="text-[17px] font-semibold">Hasło</h2>
                <div><label class="sf-label" for="pw-cur">Obecne hasło</label><input id="pw-cur" name="cur" type="password" autocomplete="current-password" class="sf-input" [(ngModel)]="pw.current" /></div>
                <div><label class="sf-label" for="pw-new">Nowe hasło</label><input id="pw-new" name="new" type="password" autocomplete="new-password" class="sf-input" [(ngModel)]="pw.next" /></div>
                <button type="submit" class="sf-btn">Zmień hasło</button>
              </form>
            </div>
            @if (settingsMessage(); as m) {<p class="mt-4 text-[14px]" [class.text-sf-danger]="m.error" [class.text-sf-success]="!m.error" role="status">{{ m.text }}</p>}
            <details class="sf-panel mt-6 p-5">
              <summary class="cursor-pointer font-semibold">Usuń konto</summary>
              <p class="mt-2 text-[14px] text-sf-muted">Usuniemy konto, zapisane adresy i sesje. Złożone zamówienia sklep przechowuje nadal — wymagają tego przepisy podatkowe.</p>
              <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="deleteAccount()">
                <div><label class="sf-label" for="del-pw">Hasło</label><input id="del-pw" name="delpw" type="password" autocomplete="current-password" class="sf-input" [(ngModel)]="deletePassword" /></div>
                <button type="submit" class="sf-btn !bg-sf-danger !text-white">Usuń konto na stałe</button>
              </form>
            </details>
          }
        }
      } @else if (session.ready()) {
        <p class="text-sf-muted">Przekierowujemy do logowania…</p>
      } @else {
        <div class="space-y-3" role="status" aria-busy="true"><span class="sr-only">Wczytywanie…</span><span class="sf-shimmer block h-5 w-2/3 rounded-[6px]"></span><span class="sf-shimmer block h-20 rounded-[10px]"></span><span class="sf-shimmer block h-20 rounded-[10px]"></span></div>
      }
    </div>
  `,
})
export class AccountPage {
  protected readonly session = inject(CustomerSession);
  private readonly router = inject(Router);
  private readonly store = inject(StoreState);
  readonly zakladka = input<string>();
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'zamowienia', label: 'Zamówienia' }, { id: 'zwroty', label: 'Zwroty i reklamacje' }, { id: 'opinie', label: 'Do oceny' }, { id: 'adresy', label: 'Adresy' }, { id: 'ustawienia', label: 'Ustawienia' },
  ];
  protected readonly tab = computed<Tab>(() => (this.tabs.some((t) => t.id === this.zakladka()) ? (this.zakladka() as Tab) : 'zamowienia'));
  protected readonly status = ORDER_STATUS;
  protected readonly payment = PAYMENT_STATUS;

  protected readonly orders = rxResource({
    params: () => (this.session.account() ? this.session.account()!.id : undefined),
    stream: () => this.session.orders(),
  });
  protected readonly ordersList = computed<CustomerOrder[] | undefined>(() => (this.orders.hasValue() ? this.orders.value() : undefined));
  protected readonly returns = rxResource({
    params: () => (this.session.account() && this.tab() === 'zwroty' ? this.session.account()!.id : undefined),
    stream: ({ params }) => (params ? this.session.returns() : of([])),
  });
  protected readonly returnList = computed<CustomerReturn[] | undefined>(() => (this.returns.hasValue() ? this.returns.value() : undefined));
  protected readonly returnStatus: Record<string, string> = { REQUESTED: 'Oczekuje', ACCEPTED: 'Przyjęte', REJECTED: 'Odrzucone', COMPLETED: 'Zakończone' };
  protected readonly returnTone: Record<string, string> = {
    REQUESTED: 'bg-sf-soft', ACCEPTED: 'bg-sf-soft text-sf-success', REJECTED: 'bg-sf-soft text-sf-danger', COMPLETED: 'bg-sf-soft text-sf-muted',
  };
  private readonly reviewables = rxResource({
    params: () => (this.session.account() ? this.session.account()!.id : undefined),
    stream: () => this.session.reviewable(),
  });
  protected readonly toReview = computed<Reviewable[]>(() => (this.reviewables.hasValue() ? this.reviewables.value() : []));
  private readonly drafts = signal<Record<string, ReviewDraft>>({});
  protected readonly reviewedNow = signal(false);

  private readonly addresses = rxResource({
    params: () => (this.session.account() && this.tab() === 'adresy' ? this.session.account()!.id : undefined),
    stream: ({ params }) => (params ? this.session.addresses() : of([])),
  });
  protected readonly addressList = computed<SavedAddress[]>(() => (this.addresses.hasValue() ? this.addresses.value() : []));
  protected readonly addressForm = signal<AddressForm | null>(null);
  protected readonly addressError = signal<string | null>(null);

  protected profile = { firstName: '', lastName: '', phone: '' };
  protected pw = { current: '', next: '' };
  protected deletePassword = '';
  protected readonly settingsMessage = signal<{ text: string; error: boolean } | null>(null);

  constructor() {
    inject(Seo).set({ title: 'Moje konto', path: '/konto', noindex: true }, this.store.store()?.name ?? '');
    void this.session.load().then(() => {
      if (!this.session.account()) void this.router.navigate(['/konto/logowanie'], { queryParams: { powrot: '/konto' }, replaceUrl: true });
    });
    effect(() => {
      const a = this.session.account();
      if (a) this.profile = { firstName: a.firstName, lastName: a.lastName, phone: a.phone ?? '' };
    });
  }

  protected fmt(minor: number): string {
    return money(minor);
  }

  protected date(iso: string): string {
    return DATE.format(new Date(iso));
  }

  protected key(r: Reviewable): string {
    return r.orderNumber + '-' + r.productId;
  }

  protected draft(r: Reviewable): ReviewDraft {
    return this.drafts()[this.key(r)] ?? { rating: 0, body: '', busy: false, error: null };
  }

  protected patch(r: Reviewable, change: Partial<ReviewDraft>): void {
    this.drafts.update((all) => ({ ...all, [this.key(r)]: { ...this.draft(r), ...change } }));
  }

  protected async sendReview(r: Reviewable): Promise<void> {
    const d = this.draft(r);
    if (!d.rating) {
      this.patch(r, { error: 'Wybierz ocenę od 1 do 5 gwiazdek.' });
      return;
    }
    this.patch(r, { busy: true, error: null });
    try {
      await firstValueFrom(this.session.review({ orderNumber: r.orderNumber, productId: r.productId, rating: d.rating, body: d.body.trim() || null, authorName: null }));
      this.reviewedNow.set(true);
      this.reviewables.reload();
    } catch (e) {
      this.patch(r, { busy: false, error: apiMessage(e) });
    }
  }

  protected editAddress(a: SavedAddress | null): void {
    this.addressError.set(null);
    this.addressForm.set(a ? { id: a.id, name: a.name, company: a.company ?? '', line1: a.line1, line2: a.line2 ?? '', postalCode: a.postalCode,
      city: a.city, phone: a.phone ?? '', isDefault: a.isDefault }
      : { id: null, name: `${this.session.account()?.firstName ?? ''} ${this.session.account()?.lastName ?? ''}`.trim(), company: '', line1: '',
        line2: '', postalCode: '', city: '', phone: this.session.account()?.phone ?? '', isDefault: false });
  }

  protected async saveAddress(): Promise<void> {
    const f = this.addressForm();
    if (!f) return;
    try {
      await firstValueFrom(this.session.saveAddress({ name: f.name, company: f.company || null, line1: f.line1, line2: f.line2 || null,
        postalCode: f.postalCode.trim(), city: f.city, countryCode: 'PL', phone: f.phone || null, isDefault: f.isDefault }, f.id));
      this.addressForm.set(null);
      this.addresses.reload();
    } catch (e) {
      this.addressError.set(apiMessage(e));
    }
  }

  protected async removeAddress(a: SavedAddress): Promise<void> {
    await firstValueFrom(this.session.deleteAddress(a.id));
    this.addresses.reload();
  }

  protected async saveProfile(): Promise<void> {
    try {
      const a = await firstValueFrom(this.session.updateProfile({ firstName: this.profile.firstName, lastName: this.profile.lastName,
        phone: this.profile.phone.trim() || null }));
      this.session.account.set(a);
      this.settingsMessage.set({ text: 'Zapisano dane.', error: false });
    } catch (e) {
      this.settingsMessage.set({ text: apiMessage(e), error: true });
    }
  }

  protected async changePassword(): Promise<void> {
    try {
      await firstValueFrom(this.session.changePassword(this.pw.current, this.pw.next));
      this.pw = { current: '', next: '' };
      this.settingsMessage.set({ text: 'Hasło zostało zmienione. Inne urządzenia zostały wylogowane.', error: false });
    } catch (e) {
      this.settingsMessage.set({ text: apiMessage(e), error: true });
    }
  }

  protected async deleteAccount(): Promise<void> {
    try {
      await firstValueFrom(this.session.deleteAccount(this.deletePassword));
      this.session.signedOut();
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.settingsMessage.set({ text: apiMessage(e), error: true });
    }
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl('/');
  }
}
