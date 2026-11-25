import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi } from '@shopivo/api-client';
import { PRODUCT_STATUS_LABELS, ProductRow, ProductStatus } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, BadgeTone, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent,
  LoadingComponent, PageHeaderComponent, SelectComponent, SelectOption, StatCardComponent, TabOption, TabsComponent,
  ToastService, formatMoney, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const STATUS_TONE: Record<ProductStatus, BadgeTone> = { ACTIVE: 'success', DRAFT: 'neutral', ARCHIVED: 'warning' };
type BulkAction = 'ACTIVATE' | 'DRAFT' | 'ARCHIVE' | 'DELETE';

@Component({
  selector: 'sv-products-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, EmptyStateComponent, TabsComponent, SelectComponent, DialogComponent, StatCardComponent,
    DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Produkty" description="Katalog sklepu: produkty, warianty, ceny i stany magazynowe.">
      <button sv-button variant="secondary" [loading]="exporting()" (click)="exportCsv()"><svg [lucideIcon]="icons.download" />Eksportuj CSV</button>
      @if (canWrite) {
        <a sv-button routerLink="nowy"><svg [lucideIcon]="icons.plus" />Dodaj produkt</a>
      }
    </sv-page-header>

    <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <sv-stat-card label="Produkty" icon="products" tone="blue" [value]="stat('products')" caption="Bez zarchiwizowanych" />
      <sv-stat-card label="Aktywne" icon="success" tone="green" [value]="stat('activeProducts')" caption="Widoczne w sklepie" />
      <sv-stat-card label="Niski stan" icon="inventory" tone="orange" [value]="stat('lowStockVariants')" caption="Warianty do uzupełnienia" />
      <sv-stat-card label="Brak w magazynie" icon="alert" tone="coral" [value]="stat('outOfStockVariants')" caption="Warianty niedostępne" />
    </div>

    <sv-card class="mt-4" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5">
        <sv-tabs label="Status produktów" [tabs]="statusTabs" [active]="statusTab()" (activeChange)="setStatus($event)" />
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div class="relative lg:w-80">
            <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input class="sv-input pl-9" type="search" placeholder="Nazwa, SKU lub EAN…" aria-label="Szukaj produktów"
              [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
          </div>
          <sv-select class="lg:w-60" [options]="categoryOptions()" [value]="categoryId()" (valueChange)="categoryId.set($event || ''); page.set(0)"
            ariaLabel="Kategoria" leadingIcon="categories" />
          <sv-select class="lg:w-52" [options]="sortOptions" [value]="sort()" (valueChange)="sort.set($event || 'UPDATED')" ariaLabel="Sortowanie" />
          <label class="flex items-center gap-2.5 text-[13px] text-ink lg:ml-auto">
            <input type="checkbox" role="switch" class="sv-switch" [ngModel]="lowStock()" (ngModelChange)="lowStock.set($event); page.set(0)" />
            Tylko niski stan
          </label>
        </div>
      </div>

      @if (selected().size > 0 && canWrite) {
        <div class="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-primary-soft px-4 py-2.5 text-[13px]">
          <span class="font-medium text-primary-strong">Zaznaczono: {{ selected().size }}</span>
          <span class="flex-1"></span>
          <button sv-button size="sm" variant="secondary" (click)="bulk('ACTIVATE')">Aktywuj</button>
          <button sv-button size="sm" variant="secondary" (click)="bulk('DRAFT')">Przenieś do szkiców</button>
          <button sv-button size="sm" variant="secondary" (click)="bulk('ARCHIVE')">Archiwizuj</button>
          <button sv-button size="sm" variant="danger" (click)="confirmDelete.set(true)">Usuń</button>
        </div>
      }

      @if (rows.isLoading() && !rows.value()) {
        <sv-loading />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać produktów.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        @if (filtersActive()) {
          <sv-empty-state icon="search" title="Brak wyników" description="Zmień filtry lub wyszukiwaną frazę." />
        } @else {
          <sv-empty-state icon="products" title="Nie masz jeszcze produktów" description="Dodaj pierwszy produkt — z wariantami, cenami i stanem magazynu.">
            @if (canWrite) {<a sv-button routerLink="nowy" class="mt-4"><svg [lucideIcon]="icons.plus" />Dodaj produkt</a>}
          </sv-empty-state>
        }
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[860px]">
            <thead>
              <tr>
                @if (canWrite) {
                  <th scope="col" class="w-10"><input type="checkbox" class="sv-checkbox" aria-label="Zaznacz wszystkie na stronie"
                    [checked]="allSelected()" (change)="toggleAll($any($event.target).checked)" /></th>
                }
                <th scope="col">Produkt</th><th scope="col">Status</th><th scope="col" class="text-right">Stan</th>
                <th scope="col" class="text-right">Cena</th><th scope="col">Kategorie</th><th scope="col">Zmieniono</th>
              </tr>
            </thead>
            <tbody>
              @for (p of rows.value()!.items; track p.id) {
                <tr class="cursor-pointer hover:bg-hover" (click)="open(p)">
                  @if (canWrite) {
                    <td (click)="$event.stopPropagation()"><input type="checkbox" class="sv-checkbox" [attr.aria-label]="'Zaznacz ' + p.name"
                      [checked]="selected().has(p.id)" (change)="toggle(p.id, $any($event.target).checked)" /></td>
                  }
                  <td>
                    <a [routerLink]="[p.id]" class="font-medium text-ink hover:text-primary-strong" (click)="$event.stopPropagation()">{{ p.name }}</a>
                    <p class="text-[12px] text-ink-muted">
                      {{ p.variantCount > 1 ? p.variantCount + ' wariantów' : (p.sku || 'Bez SKU') }}@if (p.type === 'DIGITAL') { · cyfrowy}
                    </p>
                  </td>
                  <td><sv-badge [tone]="statusTone[p.status]">{{ statusLabels[p.status] }}</sv-badge></td>
                  <td class="whitespace-nowrap text-right tabular-nums">
                    @if (p.stock === null) {<span class="text-ink-muted">nie śledzony</span>}
                    @else {
                      <span [class.text-danger-ink]="p.stock <= 0" [class.text-warning-ink]="p.lowStock && p.stock > 0">{{ p.stock }} szt.</span>
                    }
                  </td>
                  <td class="whitespace-nowrap text-right tabular-nums">{{ priceLabel(p) }}</td>
                  <td class="max-w-[220px] truncate text-ink-soft">{{ p.categories.join(', ') || '—' }}</td>
                  <td class="whitespace-nowrap text-ink-muted">{{ p.updatedAt | svDate: 'relative' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ rangeLabel() }}</span>
          <div class="flex gap-2">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </sv-card>

    <sv-dialog heading="Usunąć zaznaczone produkty?" [open]="confirmDelete()" (closed)="confirmDelete.set(false)">
      Usuniętych produktów ({{ selected().size }}) nie da się przywrócić, razem z ich wariantami i historią stanów.
      Jeśli chcesz tylko ukryć produkty, użyj archiwizacji.
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="confirmDelete.set(false)">Anuluj</button>
        <button sv-button variant="danger" type="button" [loading]="busy()" (click)="bulk('DELETE')">Usuń na stałe</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class ProductsPage implements OnInit {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly statusLabels = PRODUCT_STATUS_LABELS;
  protected readonly statusTone = STATUS_TONE;
  protected readonly canWrite = this.ctx.can('PRODUCTS_WRITE');
  /** Optional `?kategoria=` (link from the categories page). */
  readonly kategoria = input<string>();

  protected readonly statusTabs: TabOption[] = [
    { id: 'ALL', label: 'Wszystkie' }, { id: 'ACTIVE', label: 'Aktywne' }, { id: 'DRAFT', label: 'Szkice' }, { id: 'ARCHIVED', label: 'Archiwum' },
  ];
  protected readonly sortOptions: SelectOption[] = [
    { value: 'UPDATED', label: 'Ostatnio zmienione' }, { value: 'NAME', label: 'Nazwa A–Z' },
    { value: 'PRICE', label: 'Cena rosnąco' }, { value: 'STOCK', label: 'Stan rosnąco' },
  ];

  protected readonly statusTab = signal('ALL');
  protected readonly query = signal('');
  protected readonly categoryId = signal('');
  protected readonly sort = signal('UPDATED');
  protected readonly lowStock = signal(false);
  protected readonly page = signal(0);
  protected readonly selected = signal(new Set<string>());
  protected readonly confirmDelete = signal(false);
  protected readonly busy = signal(false);
  protected readonly exporting = signal(false);

  protected readonly stats = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.stats(params) });
  protected readonly categories = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.categories(params) });
  protected readonly rows = rxResource({
    params: () => ({
      tenant: this.ctx.tenantId(), q: this.query(), status: this.statusTab() === 'ALL' ? null : (this.statusTab() as ProductStatus),
      categoryId: this.categoryId() || null, lowStock: this.lowStock(), sort: this.sort(), page: this.page(),
    }),
    stream: ({ params }) => this.api.products(params.tenant, params),
  });

  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Wszystkie kategorie' },
    ...(this.categories.value() ?? []).map((c) => ({ value: c.id, label: ' '.repeat(c.depth) + c.name })),
  ]);
  protected readonly filtersActive = computed(() => !!this.query().trim() || !!this.categoryId() || this.lowStock() || this.statusTab() !== 'ALL');
  protected readonly allSelected = computed(() => {
    const items = this.rows.value()?.items ?? [];
    return items.length > 0 && items.every((p) => this.selected().has(p.id));
  });
  protected readonly rangeLabel = computed(() => {
    const r = this.rows.value();
    if (!r || !r.totalItems) return '';
    const from = r.page * r.size + 1;
    return `${from}–${from + r.items.length - 1} z ${r.totalItems}`;
  });

  ngOnInit(): void {
    if (this.kategoria()) this.categoryId.set(this.kategoria()!);
  }

  protected stat(key: 'products' | 'activeProducts' | 'lowStockVariants' | 'outOfStockVariants'): string | null {
    const s = this.stats.value();
    return s ? String(s[key]) : null;
  }

  protected priceLabel(p: ProductRow): string {
    return p.minPriceMinor === p.maxPriceMinor ? formatMoney(p.minPriceMinor, p.currency)
      : `${formatMoney(p.minPriceMinor, p.currency)} – ${formatMoney(p.maxPriceMinor, p.currency)}`;
  }

  protected setStatus(id: string): void {
    this.statusTab.set(id);
    this.page.set(0);
    this.selected.set(new Set());
  }

  protected open(p: ProductRow): void {
    void this.router.navigate(['/sklep', this.ctx.tenantId(), 'produkty', p.id]);
  }

  protected toggle(id: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) next.add(id); else next.delete(id);
    this.selected.set(next);
  }

  protected toggleAll(on: boolean): void {
    const next = new Set(this.selected());
    for (const p of this.rows.value()?.items ?? []) {
      if (on) next.add(p.id); else next.delete(p.id);
    }
    this.selected.set(next);
  }

  protected async bulk(action: BulkAction): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.bulk(this.ctx.tenantId(), [...this.selected()], action));
      const verb = { ACTIVATE: 'Aktywowano', DRAFT: 'Przeniesiono do szkiców', ARCHIVE: 'Zarchiwizowano', DELETE: 'Usunięto' }[action];
      this.toast.success(`${verb}: ${r.affected}.`);
      this.selected.set(new Set());
      this.confirmDelete.set(false);
      this.rows.reload();
      this.stats.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await firstValueFrom(this.api.exportCsv(this.ctx.tenantId()));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produkty-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.exporting.set(false);
    }
  }
}
