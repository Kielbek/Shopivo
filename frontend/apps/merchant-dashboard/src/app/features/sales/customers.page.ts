import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, OrdersApi } from '@shopivo/api-client';
import { Customer, ORDER_STATUS_LABELS } from '@shopivo/shared-models';
import {
  AlertComponent, AvatarComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent,
  LoadingComponent, MoneyPipe, PageHeaderComponent, SelectComponent, SelectOption, ToastService, downloadBlob, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { ORDER_TONE } from './order-tones';

@Component({
  selector: 'sv-customers-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, DialogComponent, SelectComponent, AvatarComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Klienci" description="Kupujący w Twoim sklepie. Karty klientów powstają automatycznie przy zamówieniach.">
      @if (canExport) {
        <button sv-button variant="secondary" (click)="exportMarketing()"><svg [lucideIcon]="icons.download" />Eksport zgód marketingowych</button>
      }
    </sv-page-header>

    <sv-card class="mt-6" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center">
        <div class="relative sm:w-80">
          <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input class="sv-input pl-9" type="search" placeholder="Imię, nazwisko, e-mail, telefon…" aria-label="Szukaj klientów"
            [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
        </div>
        <sv-select class="sm:w-56" [options]="sortOptions" [value]="sort()" (valueChange)="sort.set($event || 'LAST_ORDER')" ariaLabel="Sortowanie" />
        <label class="flex items-center gap-2.5 text-[13px] text-ink sm:ml-auto">
          <input type="checkbox" role="switch" class="sv-switch" [ngModel]="marketing()" (ngModelChange)="marketing.set($event); page.set(0)" />Ze zgodą marketingową
        </label>
      </div>
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać klientów.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        <sv-empty-state icon="users" [title]="query() || marketing() ? 'Brak wyników' : 'Brak klientów'"
          [description]="query() || marketing() ? 'Zmień filtry.' : 'Klienci pojawią się po pierwszych zamówieniach.'" />
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[720px]">
            <thead><tr><th scope="col">Klient</th><th scope="col" class="text-right">Zamówienia</th><th scope="col" class="text-right">Wydał(a)</th>
              <th scope="col">Ostatnie zamówienie</th><th scope="col">Marketing</th></tr></thead>
            <tbody>
              @for (c of rows.value()!.items; track c.id) {
                <tr class="cursor-pointer hover:bg-hover" (click)="open(c)">
                  <td><div class="flex items-center gap-3"><sv-avatar [name]="name(c)" />
                    <div class="min-w-0"><p class="truncate font-medium text-ink">{{ name(c) }}</p><p class="truncate text-[12px] text-ink-muted">{{ c.email }}</p></div></div></td>
                  <td class="text-right tabular-nums">{{ c.ordersCount }}</td>
                  <td class="text-right tabular-nums">{{ c.totalSpentMinor | svMoney }}</td>
                  <td class="whitespace-nowrap text-ink-muted">{{ c.lastOrderAt | svDate: 'relative' }}</td>
                  <td>@if (c.acceptsMarketing) {<sv-badge tone="success">Zgoda</sv-badge>} @else {<span class="text-ink-muted">—</span>}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ rows.value()!.totalItems }} klientów</span>
          <div class="flex gap-2">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </sv-card>

    <sv-dialog [heading]="selected() ? name(selected()!) : ''" [open]="!!selected()" (closed)="selected.set(null)">
      @if (selected(); as c) {
        <div class="space-y-4 text-[13px]">
          <dl class="grid grid-cols-2 gap-3">
            <div><dt class="text-ink-muted">E-mail</dt><dd class="break-all text-ink">{{ c.email }}</dd></div>
            <div><dt class="text-ink-muted">Telefon</dt><dd class="text-ink">{{ c.phone || '—' }}</dd></div>
            <div><dt class="text-ink-muted">Klient od</dt><dd class="text-ink">{{ c.createdAt | svDate: 'date' }}</dd></div>
            <div><dt class="text-ink-muted">Zgoda marketingowa</dt><dd class="text-ink">{{ c.acceptsMarketing ? 'od ' : 'brak' }}{{ c.acceptsMarketing ? (c.marketingConsentAt | svDate: 'date') : '' }}</dd></div>
          </dl>
          <section>
            <h3 class="font-semibold text-ink">Zamówienia</h3>
            @if (orders.isLoading()) {<sv-loading />}
            @else {
              <ul class="mt-2 divide-y divide-line">
                @for (o of orders.value()?.items; track o.id) {
                  <li class="flex items-center justify-between gap-3 py-2">
                    <a class="font-medium text-ink hover:text-primary-strong" [routerLink]="['/sklep', ctx.tenantId(), 'zamowienia', o.id]">#{{ o.number }}</a>
                    <span class="text-ink-muted">{{ o.createdAt | svDate: 'date' }}</span>
                    <sv-badge [tone]="orderTone[o.status]">{{ statusLabels[o.status] }}</sv-badge>
                    <span class="tabular-nums">{{ o.totalMinor | svMoney }}</span>
                  </li>
                } @empty {<li class="py-2 text-ink-muted">Brak zamówień.</li>}
              </ul>
            }
          </section>
          <section>
            <label class="sv-label" for="cust-note">Notatka (widoczna tylko dla zespołu)</label>
            <textarea id="cust-note" class="sv-input mt-1.5 min-h-20 py-2.5" maxlength="2000" [(ngModel)]="note" [disabled]="!canWrite"></textarea>
          </section>
        </div>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="selected.set(null)">Zamknij</button>
        @if (canWrite) {<button sv-button type="button" [loading]="saving()" (click)="saveNote()">Zapisz notatkę</button>}
      </ng-container>
    </sv-dialog>
  `,
})
export class CustomersPage implements OnInit {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly orderTone = ORDER_TONE;
  protected readonly canWrite = this.ctx.can('CUSTOMERS_WRITE');
  protected readonly canExport = this.ctx.can('MARKETING_WRITE');

  /** `?klient=` from an order. */
  readonly klient = input<string>();

  protected readonly sortOptions: SelectOption[] = [
    { value: 'LAST_ORDER', label: 'Ostatnie zamówienie' }, { value: 'NEWEST', label: 'Najnowsi' },
    { value: 'TOTAL_SPENT', label: 'Najwięcej wydali' }, { value: 'NAME', label: 'Nazwisko A–Z' },
  ];
  protected readonly query = signal('');
  protected readonly sort = signal('LAST_ORDER');
  protected readonly marketing = signal(false);
  protected readonly page = signal(0);
  protected readonly selected = signal<Customer | null>(null);
  protected readonly saving = signal(false);
  protected note = '';

  protected readonly rows = rxResource({
    params: () => ({ t: this.ctx.tenantId(), q: this.query(), m: this.marketing(), s: this.sort(), p: this.page() }),
    stream: ({ params }) => this.api.customers(params.t, params.q, params.m, params.s, params.p),
  });
  protected readonly orders = rxResource({
    params: () => (this.selected() ? { t: this.ctx.tenantId(), id: this.selected()!.id } : undefined),
    stream: ({ params }) => this.api.orders(params.t, { customerId: params.id, page: 0, size: 20 }),
  });

  async ngOnInit(): Promise<void> {
    const id = this.klient();
    if (id) {
      try {
        this.open(await firstValueFrom(this.api.customer(this.ctx.tenantId(), id)));
      } catch {
        // not found — list stays visible
      }
    }
  }

  protected name(c: Customer): string {
    return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email;
  }

  protected open(c: Customer): void {
    this.note = c.note ?? '';
    this.selected.set(c);
  }

  protected async saveNote(): Promise<void> {
    const c = this.selected();
    if (!c) return;
    this.saving.set(true);
    try {
      const updated = await firstValueFrom(this.api.updateCustomerNote(this.ctx.tenantId(), c.id, this.note, c.version));
      this.selected.set(updated);
      this.toast.success('Zapisano notatkę.');
      this.rows.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async exportMarketing(): Promise<void> {
    try {
      downloadBlob(await firstValueFrom(this.api.marketingExport(this.ctx.tenantId())), `zgody-marketingowe-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}
