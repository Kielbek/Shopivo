import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CustomerOrder, CustomerSession, ReturnKind, apiMessage } from '../core/account';

/**
 * "Zwrot lub reklamacja" for one of the customer's orders: choose what and how many, the kind of request and (for a
 * complaint) what is wrong. Only items that can still be returned are offered.
 */
@Component({
  selector: 'sf-return-request',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (options.hasValue() && options.value().kinds.length && anyLeft()) {
      @if (!open()) {
        <section class="sf-panel mt-8 flex flex-wrap items-center gap-3 p-5">
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">Zwrot lub reklamacja</h2>
            <p class="mt-0.5 text-[14px] text-sf-muted">
              @if (options.value().kinds.includes('WITHDRAWAL')) {Masz 14 dni od otrzymania przesyłki na zwrot bez podania przyczyny.}
              @else {Termin na zwrot minął — możesz zgłosić reklamację wadliwego produktu.}
            </p>
          </div>
          <button type="button" class="sf-btn-outline" (click)="start()">Zgłoś</button>
        </section>
      } @else {
        <form class="sf-panel mt-8 space-y-5 p-5" (ngSubmit)="submit()" aria-labelledby="ret-h">
          <h2 id="ret-h" class="text-[17px] font-semibold">Zwrot lub reklamacja</h2>
          <fieldset>
            <legend class="sf-label">Czego dotyczy zgłoszenie?</legend>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              @for (k of options.value().kinds; track k) {
                <label class="flex cursor-pointer gap-3 rounded-[10px] border p-3" [class]="kind() === k ? 'border-sf-text' : 'border-sf-line'">
                  <input type="radio" name="kind" class="mt-1" [value]="k" [checked]="kind() === k" (change)="kind.set(k)" />
                  <span><span class="block font-medium">{{ k === 'WITHDRAWAL' ? 'Zwrot (odstąpienie od umowy)' : 'Reklamacja' }}</span>
                    <span class="block text-[13px] text-sf-muted">{{ k === 'WITHDRAWAL' ? 'Bez podania przyczyny, w ciągu 14 dni od otrzymania.' : 'Produkt jest wadliwy lub niezgodny z opisem.' }}</span></span>
                </label>
              }
            </div>
          </fieldset>
          <fieldset>
            <legend class="sf-label">Produkty</legend>
            <ul class="mt-2 divide-y divide-sf-line rounded-[10px] border border-sf-line">
              @for (i of order().items; track i.id) {
                @let max = left()[i.id] ?? 0;
                <li class="flex items-center gap-3 px-4 py-3 text-[14px]" [class.opacity-50]="!max">
                  <span class="min-w-0 flex-1">{{ i.name }}@if (i.variantTitle) { <span class="text-sf-muted">({{ i.variantTitle }})</span>}
                    @if (!max) {<span class="block text-[12px] text-sf-muted">już zgłoszony</span>}</span>
                  @if (max) {
                    <label class="sr-only" [attr.for]="'rq-' + i.id">Ile sztuk: {{ i.name }}</label>
                    <select class="sf-input !h-10 !w-24" [id]="'rq-' + i.id" [ngModel]="qty()[i.id] ?? 0" [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="setQty(i.id, +$event)">
                      @for (n of range(max); track n) {<option [value]="n">{{ n === 0 ? '—' : n + ' szt.' }}</option>}
                    </select>
                  }
                </li>
              }
            </ul>
          </fieldset>
          <div>
            <label class="sf-label" for="ret-reason">{{ kind() === 'COMPLAINT' ? 'Opisz wadę' : 'Powód (opcjonalnie)' }}</label>
            <textarea id="ret-reason" name="reason" class="sf-input mt-1.5 min-h-24 py-2.5" maxlength="2000" [(ngModel)]="reason"
              [attr.aria-required]="kind() === 'COMPLAINT'"
              [placeholder]="kind() === 'COMPLAINT' ? 'Co jest nie tak i kiedy to zauważyłeś(-aś)?' : 'Pomoże nam to ulepszyć ofertę'"></textarea>
          </div>
          <div>
            <label class="sf-label" for="ret-account">Numer rachunku do zwrotu pieniędzy (opcjonalnie)</label>
            <input id="ret-account" name="account" class="sf-input mt-1.5" inputmode="numeric" autocomplete="off" maxlength="40"
              placeholder="26 cyfr" [(ngModel)]="account" />
            <p class="mt-1 text-[12px] text-sf-muted">Podaj, jeśli płaciłeś(-aś) przy odbiorze. Przy płatności online zwrócimy pieniądze tą samą metodą.</p>
          </div>
          @if (error(); as e) {<p class="text-sf-danger" role="alert">{{ e }}</p>}
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="sf-btn" [disabled]="busy() || !chosenCount()">{{ busy() ? 'Wysyłanie…' : 'Wyślij zgłoszenie' }}</button>
            <button type="button" class="sf-btn-outline" (click)="open.set(false)">Anuluj</button>
          </div>
          <p class="text-[12px] text-sf-muted">Po wysłaniu dostaniesz potwierdzenie e-mailem. Status sprawdzisz w zakładce
            <a class="sf-link" [routerLink]="['/konto']" [queryParams]="{ zakladka: 'zwroty' }">Zwroty</a>.</p>
        </form>
      }
    }
    @if (sent()) {
      <p class="sf-panel mt-8 p-5" role="status">Dziękujemy — zgłoszenie nr {{ sent() }} zostało wysłane. Potwierdzenie wysłaliśmy e-mailem.
        <a class="sf-link" [routerLink]="['/konto']" [queryParams]="{ zakladka: 'zwroty' }">Zobacz zgłoszenia</a></p>
    }
  `,
})
export class ReturnRequestComponent {
  private readonly session = inject(CustomerSession);
  readonly order = input.required<CustomerOrder>();
  readonly submitted = output<void>();
  protected readonly options = rxResource({
    params: () => (this.order().status === 'SHIPPED' || this.order().status === 'COMPLETED' ? this.order().number : undefined),
    stream: ({ params }) => this.session.returnOptions(params),
  });
  protected readonly left = computed(() => (this.options.hasValue() ? this.options.value().returnable : {}));
  protected readonly anyLeft = computed(() => Object.values(this.left()).some((n) => n > 0));
  protected readonly open = signal(false);
  protected readonly kind = signal<ReturnKind>('WITHDRAWAL');
  protected readonly qty = signal<Record<string, number>>({});
  protected readonly chosenCount = computed(() => Object.values(this.qty()).reduce((a, b) => a + b, 0));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal<number | null>(null);
  protected reason = '';
  protected account = '';

  protected start(): void {
    const kinds = this.options.value()?.kinds ?? [];
    this.kind.set(kinds.includes('WITHDRAWAL') ? 'WITHDRAWAL' : 'COMPLAINT');
    // One returnable line: preselect it.
    const lines = Object.entries(this.left()).filter(([, n]) => n > 0);
    this.qty.set(lines.length === 1 ? { [lines[0][0]]: lines[0][1] } : {});
    this.sent.set(null);
    this.error.set(null);
    this.open.set(true);
  }

  protected range(max: number): number[] {
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  protected setQty(id: string, n: number): void {
    this.qty.update((q) => ({ ...q, [id]: n }));
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.kind() === 'COMPLAINT' && this.reason.trim().length < 10) {
      this.error.set('Opisz wadę produktu (co najmniej 10 znaków).');
      return;
    }
    const items = Object.entries(this.qty()).filter(([, n]) => n > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.session.requestReturn(this.order().number, {
        kind: this.kind(), items, reason: this.reason.trim() || null, refundAccount: this.account.trim() || null,
      }));
      this.sent.set(r.number);
      this.open.set(false);
      this.reason = '';
      this.account = '';
      this.options.reload();
      this.submitted.emit();
    } catch (e) {
      this.error.set(apiMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
