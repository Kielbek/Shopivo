import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi } from '@shopivo/api-client';
import { InventoryRow, MOVEMENT_REASON_LABELS, MovementReason } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent, FieldComponent,
  LoadingComponent, PageHeaderComponent, SelectComponent, SelectOption, TabOption, TabsComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const MANUAL_REASONS: MovementReason[] = ['RECEIPT', 'ADJUSTMENT', 'CORRECTION', 'DAMAGE', 'RETURN'];

@Component({
  selector: 'sv-inventory-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, EmptyStateComponent, DialogComponent, FieldComponent, SelectComponent, TabsComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Magazyn" description="Stany wariantów. Każda zmiana jest zapisywana w historii z autorem i powodem." />

    <sv-card class="mt-6" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center">
        <div class="relative sm:w-80">
          <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input class="sv-input pl-9" type="search" placeholder="Produkt lub SKU…" aria-label="Szukaj w magazynie"
            [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
        </div>
        <label class="flex items-center gap-2.5 text-[13px] text-ink sm:ml-auto">
          <input type="checkbox" role="switch" class="sv-switch" [ngModel]="lowOnly()" (ngModelChange)="lowOnly.set($event); page.set(0)" />
          Tylko do uzupełnienia
        </label>
      </div>
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading variant="table" [rows]="6" />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać stanów.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        <sv-empty-state icon="inventory" [title]="query() || lowOnly() ? 'Brak wyników' : 'Brak śledzonych stanów'"
          [description]="query() || lowOnly() ? 'Zmień filtry.' : 'Stany pojawią się po dodaniu produktów ze śledzeniem magazynu.'" />
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[780px]">
            <thead><tr><th scope="col">Produkt</th><th scope="col">SKU</th><th scope="col" class="text-right">Na stanie</th>
              <th scope="col" class="text-right">Zarezerwowane</th><th scope="col" class="text-right">Dostępne</th><th scope="col">Status</th>
              <th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
            <tbody>
              @for (r of rows.value()!.items; track r.variantId) {
                <tr>
                  <td><a class="font-medium text-ink hover:text-primary-strong" [routerLink]="['/sklep', ctx.tenantId(), 'produkty', r.productId]">{{ r.productName }}</a>
                    @if (r.variantTitle) {<p class="text-[12px] text-ink-muted">{{ r.variantTitle }}</p>}</td>
                  <td class="text-ink-soft">{{ r.sku || '—' }}</td>
                  <td class="text-right tabular-nums">{{ r.onHand }}</td>
                  <td class="text-right tabular-nums text-ink-muted">{{ r.reserved }}</td>
                  <td class="text-right font-medium tabular-nums">{{ r.available }}</td>
                  <td>
                    @if (r.available <= 0) {<sv-badge tone="danger">Brak</sv-badge>}
                    @else if (r.low) {<sv-badge tone="warning">Niski (≤ {{ r.lowStockThreshold }})</sv-badge>}
                    @else {<sv-badge tone="success">OK</sv-badge>}
                  </td>
                  <td class="whitespace-nowrap text-right">
                    <button sv-button size="sm" variant="ghost" (click)="openHistory(r)" [attr.aria-label]="'Historia: ' + r.productName"><svg [lucideIcon]="icons.history" /></button>
                    @if (canWrite) {<button sv-button size="sm" variant="secondary" (click)="openAdjust(r)">Zmień stan</button>}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ rows.value()!.totalItems }} pozycji</span>
          <div class="flex gap-2">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </sv-card>

    <sv-dialog [heading]="'Zmiana stanu: ' + (adjusting()?.productName ?? '')" [open]="!!adjusting()" (closed)="adjusting.set(null)">
      @if (adjusting(); as r) {
        <form id="adjust-form" class="space-y-4" (ngSubmit)="adjust()">
          <p class="text-[13px] text-ink-soft">{{ r.variantTitle || 'Wariant domyślny' }} · teraz na stanie: <strong class="text-ink">{{ r.onHand }}</strong>
            @if (r.reserved) {, zarezerwowane: {{ r.reserved }}}</p>
          <sv-tabs label="Rodzaj zmiany" [tabs]="modes" [(active)]="mode" />
          <div class="grid gap-4 sm:grid-cols-2">
            <sv-field [label]="mode() === 'SET' ? 'Nowy stan' : 'Ilość'" for="adj-qty">
              <input id="adj-qty" name="qty" type="number" min="0" class="sv-input" required [(ngModel)]="quantity" />
            </sv-field>
            <sv-field label="Powód" for="adj-reason">
              <sv-select inputId="adj-reason" name="reason" [options]="reasonOptions" [(ngModel)]="reason" ariaLabel="Powód" />
            </sv-field>
          </div>
          <sv-field label="Notatka" for="adj-note" [optional]="true"><input id="adj-note" name="note" class="sv-input" maxlength="300" placeholder="np. faktura FV/12/2026" [(ngModel)]="note" /></sv-field>
          <p class="text-[13px] text-ink-soft">Po zmianie: <strong class="text-ink tabular-nums">{{ resultFor(adjusting()!) }}</strong> szt.</p>
          <sv-field label="Próg niskiego stanu" for="adj-threshold" hint="Poniżej tej liczby wariant trafi na listę do uzupełnienia.">
            <input id="adj-threshold" name="threshold" type="number" min="0" class="sv-input sm:w-40" [(ngModel)]="threshold" />
          </sv-field>
          @if (adjustError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
        </form>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="adjusting.set(null)">Anuluj</button>
        <button sv-button type="submit" form="adjust-form" [loading]="busy()">Zapisz</button>
      </ng-container>
    </sv-dialog>

    <sv-dialog [heading]="'Historia: ' + (historyOf()?.productName ?? '')" [open]="!!historyOf()" (closed)="historyOf.set(null)">
      @if (movements.isLoading()) {
        <sv-loading />
      } @else if (!movements.value()?.length) {
        <p class="text-[13px] text-ink-muted">Brak ruchów.</p>
      } @else {
        <ol class="divide-y divide-line text-[13px]">
          @for (m of movements.value(); track m.id) {
            <li class="flex items-start justify-between gap-3 py-2.5">
              <div class="min-w-0">
                <p class="font-medium text-ink">{{ reasons[m.reason] }}@if (m.reference) { · {{ m.reference }}}</p>
                <p class="text-ink-muted">{{ m.createdAt | svDate }}@if (m.actorName) { · {{ m.actorName }}}@if (m.note) { · {{ m.note }}}</p>
              </div>
              <div class="shrink-0 text-right tabular-nums">
                <p class="font-medium" [class.text-success-ink]="m.delta > 0" [class.text-danger-ink]="m.delta < 0">{{ m.delta > 0 ? '+' : '' }}{{ m.delta }}</p>
                <p class="text-[12px] text-ink-muted">stan: {{ m.onHandAfter }}</p>
              </div>
            </li>
          }
        </ol>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="historyOf.set(null)">Zamknij</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class InventoryPage implements OnInit {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly reasons = MOVEMENT_REASON_LABELS;
  protected readonly canWrite = this.ctx.can('PRODUCTS_WRITE');

  /** Optional `?q=` from the product editor link. */
  readonly q = input<string>();

  protected readonly modes: TabOption[] = [{ id: 'ADD', label: 'Przyjmij' }, { id: 'REMOVE', label: 'Wydaj' }, { id: 'SET', label: 'Ustaw stan' }];
  protected readonly reasonOptions: SelectOption[] = MANUAL_REASONS.map((r) => ({ value: r, label: MOVEMENT_REASON_LABELS[r] }));

  protected readonly query = signal('');
  protected readonly lowOnly = signal(false);
  protected readonly page = signal(0);
  protected readonly adjusting = signal<InventoryRow | null>(null);
  protected readonly historyOf = signal<InventoryRow | null>(null);
  protected readonly mode = signal('ADD');
  protected readonly busy = signal(false);
  protected readonly adjustError = signal<string | null>(null);
  protected quantity: number | null = null;
  protected reason: MovementReason = 'RECEIPT';
  protected note = '';
  protected threshold = 3;

  protected readonly rows = rxResource({
    params: () => ({ t: this.ctx.tenantId(), q: this.query(), low: this.lowOnly(), page: this.page() }),
    stream: ({ params }) => this.api.inventory(params.t, params.q, params.low, params.page),
  });
  protected readonly movements = rxResource({
    params: () => (this.historyOf() ? { t: this.ctx.tenantId(), v: this.historyOf()!.variantId } : undefined),
    stream: ({ params }) => this.api.movements(params.t, params.v),
  });

  ngOnInit(): void {
    if (this.q()) this.query.set(this.q()!);
  }

  protected resultFor(r: InventoryRow): number {
    const q = Number(this.quantity) || 0;
    return this.mode() === 'SET' ? q : this.mode() === 'ADD' ? r.onHand + q : r.onHand - q;
  }

  protected openAdjust(r: InventoryRow): void {
    this.quantity = null;
    this.note = '';
    this.mode.set('ADD');
    this.reason = 'RECEIPT';
    this.threshold = r.lowStockThreshold;
    this.adjustError.set(null);
    this.adjusting.set(r);
  }

  protected openHistory(r: InventoryRow): void {
    this.historyOf.set(r);
  }

  protected async adjust(): Promise<void> {
    const r = this.adjusting();
    if (!r) return;
    const q = Number(this.quantity);
    const thresholdChanged = Number(this.threshold) !== r.lowStockThreshold;
    if ((this.quantity === null || String(this.quantity) === '') && !thresholdChanged) {
      this.adjustError.set('Podaj ilość.');
      return;
    }
    if (this.quantity !== null && String(this.quantity) !== '' && (!Number.isInteger(q) || q < 0)) {
      this.adjustError.set('Ilość musi być liczbą całkowitą ≥ 0.');
      return;
    }
    this.busy.set(true);
    this.adjustError.set(null);
    try {
      const t = this.ctx.tenantId();
      if (this.quantity !== null && String(this.quantity) !== '') {
        const delta = this.mode() === 'SET' ? q : this.mode() === 'ADD' ? q : -q;
        await firstValueFrom(this.api.adjust(t, r.variantId, this.mode() === 'SET' ? 'SET' : 'DELTA', delta, this.reason, this.note.trim() || null));
      }
      if (thresholdChanged) await firstValueFrom(this.api.setThreshold(t, r.variantId, Number(this.threshold)));
      this.toast.success('Zapisano stan magazynowy.');
      this.adjusting.set(null);
      this.rows.reload();
    } catch (e) {
      this.adjustError.set(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
