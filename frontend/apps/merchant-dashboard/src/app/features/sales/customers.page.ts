import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, OrdersApi } from '@shopivo/api-client';
import { Customer, CustomerImportResult } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent, LoadingComponent, MoneyPipe,
  PageHeaderComponent, SelectComponent, SelectOption, ToastService, downloadBlob, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom, of } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { countryName, customerName } from './customer-format';

type ExportScope = 'ALL' | 'SELECTED' | 'MARKETING';

/** Columns of the sample import file — the same the export writes. */
const SAMPLE_CSV = '﻿email;imie;nazwisko;telefon;firma;adres;adres2;kod_pocztowy;miasto;kraj;tagi;zgoda_marketingowa;notatka\n'
  + 'anna.nowak@example.com;Anna;Nowak;+48 600 100 200;;ul. Długa 5/2;;00-001;Warszawa;PL;stała klientka, VIP;nie;\n';

@Component({
  selector: 'sv-customers-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, DialogComponent, SelectComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Klienci" description="Kupujący w Twoim sklepie. Karty powstają same przy zamówieniach — możesz też dodać klienta ręcznie lub zaimportować listę.">
      @if (canWrite || canExportMarketing) {
        <button sv-button variant="secondary" (click)="exportOpen.set(true)"><svg [lucideIcon]="icons.download" />Eksportuj</button>
      }
      @if (canWrite) {
        <button sv-button variant="secondary" (click)="openImport()"><svg [lucideIcon]="icons.upload" />Importuj</button>
        <a sv-button routerLink="nowy"><svg [lucideIcon]="icons.userPlus" />Dodaj klienta</a>
      }
    </sv-page-header>

    <sv-card class="mt-6" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5 lg:flex-row lg:items-center">
        <div class="relative lg:w-80">
          <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input class="sv-input pl-9" type="search" placeholder="Imię, e-mail, telefon, miasto, tag…" aria-label="Szukaj klientów"
            [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
        </div>
        @if (tagOptions().length > 1) {
          <sv-select class="lg:w-52" [options]="tagOptions()" [value]="tag()" (valueChange)="tag.set($event || ''); page.set(0)" ariaLabel="Tag" leadingIcon="tag" />
        }
        <sv-select class="lg:w-52" [options]="sortOptions" [value]="sort()" (valueChange)="sort.set($event || 'LAST_ORDER')" ariaLabel="Sortowanie" />
        <label class="flex items-center gap-2.5 text-[13px] text-ink lg:ml-auto">
          <input type="checkbox" role="switch" class="sv-switch" [ngModel]="marketing()" (ngModelChange)="marketing.set($event); page.set(0)" />Subskrybują e-maile
        </label>
      </div>

      @if (selected().size > 0) {
        <div class="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-canvas px-4 py-2.5 text-[13px]">
          <span class="font-medium text-ink">Zaznaczono: {{ selected().size }}</span>
          <button type="button" class="text-ink-muted underline-offset-2 hover:text-ink hover:underline" (click)="clearSelection()">Wyczyść</button>
          <span class="flex-1"></span>
          @if (canWrite) {
            <button sv-button size="sm" variant="secondary" (click)="tagOpen.set(true)"><svg [lucideIcon]="icons.tag" />Dodaj tag</button>
            <button sv-button size="sm" variant="secondary" [loading]="exporting()" (click)="export('SELECTED')"><svg [lucideIcon]="icons.download" />Eksportuj zaznaczonych</button>
          }
        </div>
      }

      @if (rows.isLoading() && !rows.value()) {
        <sv-loading variant="table" [rows]="6" />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać klientów.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        @if (filtersActive()) {
          <sv-empty-state icon="search" title="Brak wyników" description="Zmień filtry lub wyszukiwaną frazę." />
        } @else {
          <sv-empty-state icon="users" illustration="customers" title="Nie masz jeszcze klientów" description="Klienci pojawią się po pierwszych zamówieniach. Możesz też dodać ich ręcznie lub zaimportować z pliku CSV.">
            @if (canWrite) {
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                <button sv-button variant="secondary" (click)="openImport()"><svg [lucideIcon]="icons.upload" />Importuj</button>
                <a sv-button routerLink="nowy"><svg [lucideIcon]="icons.userPlus" />Dodaj klienta</a>
              </div>
            }
          </sv-empty-state>
        }
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[760px]">
            <thead>
              <tr>
                <th scope="col" class="w-10"><input type="checkbox" class="sv-checkbox" aria-label="Zaznacz wszystkich na stronie"
                  [checked]="allSelected()" (change)="toggleAll($any($event.target).checked)" /></th>
                <th scope="col">Klient</th><th scope="col">Subskrypcja e-maili</th><th scope="col">Lokalizacja</th>
                <th scope="col" class="text-right">Zamówienia</th><th scope="col" class="text-right">Wydana kwota</th>
              </tr>
            </thead>
            <tbody>
              @for (c of rows.value()!.items; track c.id) {
                <tr class="cursor-pointer hover:bg-hover" (click)="open(c)">
                  <td (click)="$event.stopPropagation()"><input type="checkbox" class="sv-checkbox" [attr.aria-label]="'Zaznacz ' + name(c)"
                    [checked]="selected().has(c.id)" (change)="toggle(c.id, $any($event.target).checked)" /></td>
                  <td>
                    <a [routerLink]="[c.id]" class="font-medium text-ink hover:text-primary-strong" (click)="$event.stopPropagation()">{{ name(c) }}</a>
                    @if (name(c) !== c.email) {<p class="truncate text-[12px] text-ink-muted">{{ c.email }}</p>}
                    @if (c.tags.length) {
                      <p class="mt-1 flex flex-wrap gap-1">@for (t of c.tags.slice(0, 3); track t) {<span class="sv-chip">{{ t }}</span>}
                        @if (c.tags.length > 3) {<span class="text-[11.5px] text-ink-muted">+{{ c.tags.length - 3 }}</span>}</p>
                    }
                  </td>
                  <td>@if (c.acceptsMarketing) {<sv-badge tone="success">Zasubskrybowano</sv-badge>} @else {<sv-badge>Nie subskrybuje</sv-badge>}</td>
                  <td class="text-ink-soft">{{ location(c) }}</td>
                  <td class="text-right tabular-nums">{{ c.ordersCount }}</td>
                  <td class="text-right tabular-nums">{{ c.totalSpentMinor | svMoney }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ rows.value()!.totalItems }} {{ plural(rows.value()!.totalItems) }}</span>
          <div class="flex gap-2">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </sv-card>

    <!-- Export -->
    <sv-dialog heading="Eksportuj klientów" [open]="exportOpen()" (closed)="exportOpen.set(false)">
      <fieldset class="space-y-1">
        <legend class="sr-only">Zakres eksportu</legend>
        @if (canWrite) {
          <label class="sv-choice"><input type="radio" name="scope" class="sv-radio" value="ALL" [(ngModel)]="scope" />
            <span><span class="block font-medium text-ink">Wszyscy klienci</span><span class="block text-[12.5px] text-ink-muted">{{ rows.value()?.totalItems ?? 0 }} {{ plural(rows.value()?.totalItems ?? 0) }} bez filtrów</span></span></label>
          <label class="sv-choice" [class.opacity-50]="!selected().size"><input type="radio" name="scope" class="sv-radio" value="SELECTED" [(ngModel)]="scope" [disabled]="!selected().size" />
            <span><span class="block font-medium text-ink">Zaznaczeni</span><span class="block text-[12.5px] text-ink-muted">{{ selected().size }} {{ plural(selected().size) }}</span></span></label>
        }
        @if (canExportMarketing) {
          <label class="sv-choice"><input type="radio" name="scope" class="sv-radio" value="MARKETING" [(ngModel)]="scope" />
            <span><span class="block font-medium text-ink">Tylko subskrybenci e-maili</span><span class="block text-[12.5px] text-ink-muted">E-mail, imię, nazwisko i data zgody — do programu do newslettera</span></span></label>
        }
      </fieldset>
      <p class="mt-4 text-[12.5px] text-ink-muted">Plik CSV otworzysz w Excelu lub Arkuszach Google. Kolumny są takie same jak przy imporcie, więc możesz poprawić dane i wczytać je z powrotem.
        Plik zawiera dane osobowe — przechowuj go bezpiecznie.</p>
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="exportOpen.set(false)">Anuluj</button>
        <button sv-button type="button" [loading]="exporting()" (click)="export(scope)">Eksportuj</button>
      </ng-container>
    </sv-dialog>

    <!-- Import -->
    <sv-dialog heading="Importuj klientów z pliku CSV" [open]="importOpen()" (closed)="importOpen.set(false)">
      @if (importResult(); as r) {
        <div class="space-y-3 text-[13.5px]">
          <sv-alert [tone]="r.skipped ? 'warning' : 'success'">Dodano: {{ r.created }} · zaktualizowano: {{ r.updated }}@if (r.skipped) { · pominięto: {{ r.skipped }}}</sv-alert>
          @if (r.errors.length) {
            <ul class="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius-control)] bg-canvas p-3 text-[12.5px] text-ink-soft">
              @for (e of r.errors; track $index) {<li>{{ e }}</li>}
            </ul>
          }
        </div>
      } @else {
        <div class="space-y-4 text-[13.5px]">
          <p class="text-ink-soft">Wymagana jest tylko kolumna <strong class="font-semibold text-ink">email</strong>. Klientów z tym samym adresem uzupełnimy danymi z pliku
            (puste pola nie kasują danych, tagi są dopisywane). Separator: średnik lub przecinek.</p>
          <button type="button" class="sv-link text-[13px]" (click)="downloadSample()">Pobierz przykładowy plik</button>
          <label class="flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 py-4 hover:bg-hover">
            <svg [lucideIcon]="icons.upload" [size]="18" class="text-ink-soft" />
            <span class="min-w-0 flex-1 truncate">{{ importFile()?.name || 'Wybierz plik CSV…' }}</span>
            <input type="file" accept=".csv,text/csv" class="sr-only" (change)="pickFile($any($event.target).files)" />
          </label>
          <label class="flex items-start gap-2.5 text-[13px] text-ink-soft">
            <input type="checkbox" class="sv-checkbox mt-0.5" [(ngModel)]="consentConfirmed" />
            <span>Klienci oznaczeni w kolumnie <em>zgoda_marketingowa</em> jako „tak” wyrazili zgodę na e-maile marketingowe i mogę to wykazać.
              <span class="text-ink-muted">Bez zaznaczenia tej kolumny nie bierzemy pod uwagę.</span></span>
          </label>
          @if (importError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
        </div>
      }
      <ng-container dialog-actions>
        @if (importResult()) {
          <button sv-button type="button" (click)="importOpen.set(false)">Gotowe</button>
        } @else {
          <button sv-button variant="secondary" type="button" (click)="importOpen.set(false)">Anuluj</button>
          <button sv-button type="button" [disabled]="!importFile()" [loading]="importing()" (click)="runImport()">Importuj</button>
        }
      </ng-container>
    </sv-dialog>

    <!-- Bulk tag -->
    <sv-dialog heading="Dodaj tag" [open]="tagOpen()" (closed)="tagOpen.set(false)">
      <label class="sv-label" for="bulk-tag">Tag dla zaznaczonych klientów ({{ selected().size }})</label>
      <input id="bulk-tag" class="sv-input mt-1.5" maxlength="40" list="bulk-tag-list" [(ngModel)]="bulkTag" placeholder="np. VIP, hurt, newsletter" />
      <datalist id="bulk-tag-list">@for (t of tags.value() ?? []; track t) {<option [value]="t"></option>}</datalist>
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="tagOpen.set(false)">Anuluj</button>
        <button sv-button type="button" [disabled]="!bulkTag.trim()" [loading]="tagging()" (click)="addTag()">Dodaj</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class CustomersPage implements OnInit {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('CUSTOMERS_WRITE');
  protected readonly canExportMarketing = this.ctx.can('MARKETING_WRITE');

  /** `?klient=` from older links — opens the customer page. */
  readonly klient = input<string>();

  protected readonly sortOptions: SelectOption[] = [
    { value: 'LAST_ORDER', label: 'Ostatnie zamówienie' }, { value: 'NEWEST', label: 'Ostatnio dodani' },
    { value: 'TOTAL_SPENT', label: 'Najwięcej wydali' }, { value: 'NAME', label: 'Nazwisko A–Z' },
  ];
  protected readonly query = signal('');
  protected readonly sort = signal('LAST_ORDER');
  protected readonly marketing = signal(false);
  protected readonly tag = signal('');
  protected readonly page = signal(0);
  protected readonly selected = signal<Set<string>>(new Set());

  protected readonly exportOpen = signal(false);
  protected readonly exporting = signal(false);
  protected scope: ExportScope = this.canWrite ? 'ALL' : 'MARKETING';

  protected readonly importOpen = signal(false);
  protected readonly importing = signal(false);
  protected readonly importFile = signal<File | null>(null);
  protected readonly importResult = signal<CustomerImportResult | null>(null);
  protected readonly importError = signal<string | null>(null);
  protected consentConfirmed = false;

  protected readonly tagOpen = signal(false);
  protected readonly tagging = signal(false);
  protected bulkTag = '';

  protected readonly rows = rxResource({
    params: () => ({ t: this.ctx.tenantId(), q: this.query(), m: this.marketing(), s: this.sort(), p: this.page(), tag: this.tag() }),
    stream: ({ params }) => this.api.customers(params.t, params.q, params.m, params.s, params.p, params.tag),
  });
  protected readonly tags = rxResource({
    params: () => ({ t: this.ctx.tenantId() }),
    stream: ({ params }) => (this.ctx.can('CUSTOMERS_READ') ? this.api.customerTags(params.t) : of([])),
  });
  protected readonly tagOptions = computed<SelectOption[]>(() => [{ value: '', label: 'Wszystkie tagi' },
    ...(this.tags.value() ?? []).map((t) => ({ value: t, label: t }))]);
  protected readonly filtersActive = computed(() => !!this.query().trim() || this.marketing() || !!this.tag());
  protected readonly allSelected = computed(() => {
    const items = this.rows.value()?.items ?? [];
    return items.length > 0 && items.every((c) => this.selected().has(c.id));
  });

  ngOnInit(): void {
    const id = this.klient();
    if (id) void this.router.navigate(['/sklep', this.ctx.tenantId(), 'klienci', id], { replaceUrl: true });
  }

  protected name(c: Customer): string {
    return customerName(c);
  }

  protected location(c: Customer): string {
    const country = countryName(c.address.countryCode);
    return [c.address.city, country].filter(Boolean).join(', ') || '—';
  }

  /** Masculine-personal noun: "1 klient", otherwise "N klientów" (read as "dwóch/pięciu klientów"). */
  protected plural(n: number): string {
    return n === 1 ? 'klient' : 'klientów';
  }

  protected open(c: Customer): void {
    void this.router.navigate(['/sklep', this.ctx.tenantId(), 'klienci', c.id]);
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected toggle(id: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  protected toggleAll(on: boolean): void {
    const next = new Set(this.selected());
    for (const c of this.rows.value()?.items ?? []) {
      if (on) next.add(c.id);
      else next.delete(c.id);
    }
    this.selected.set(next);
  }

  protected async export(scope: ExportScope): Promise<void> {
    this.exporting.set(true);
    const day = new Date().toISOString().slice(0, 10);
    try {
      if (scope === 'MARKETING') {
        downloadBlob(await firstValueFrom(this.api.marketingExport(this.ctx.tenantId())), `zgody-marketingowe-${day}.csv`);
      } else {
        const ids = scope === 'SELECTED' ? [...this.selected()] : [];
        downloadBlob(await firstValueFrom(this.api.customersExport(this.ctx.tenantId(), ids)), `klienci-${day}.csv`);
      }
      this.exportOpen.set(false);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.exporting.set(false);
    }
  }

  protected openImport(): void {
    this.importFile.set(null);
    this.importResult.set(null);
    this.importError.set(null);
    this.consentConfirmed = false;
    this.importOpen.set(true);
  }

  protected pickFile(files: FileList | null): void {
    this.importError.set(null);
    const f = files?.[0] ?? null;
    if (f && f.size > 5 * 1024 * 1024) {
      this.importError.set('Plik jest za duży (maks. 5 MB).');
      return;
    }
    this.importFile.set(f);
  }

  protected downloadSample(): void {
    downloadBlob(new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }), 'klienci-przyklad.csv');
  }

  protected async runImport(): Promise<void> {
    const f = this.importFile();
    if (!f) return;
    this.importing.set(true);
    this.importError.set(null);
    try {
      this.importResult.set(await firstValueFrom(this.api.importCustomers(this.ctx.tenantId(), f, this.consentConfirmed)));
      this.rows.reload();
      this.tags.reload();
    } catch (e) {
      this.importError.set(ApiError.from(e).message);
    } finally {
      this.importing.set(false);
    }
  }

  protected async addTag(): Promise<void> {
    this.tagging.set(true);
    try {
      const r = await firstValueFrom(this.api.tagCustomers(this.ctx.tenantId(), [...this.selected()], this.bulkTag.trim()));
      this.toast.success(r.changed ? `Dodano tag — ${r.changed === 1 ? '1 klient' : r.changed + ' klientów'}.` : 'Zaznaczeni klienci mają już ten tag.');
      this.tagOpen.set(false);
      this.bulkTag = '';
      this.rows.reload();
      this.tags.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.tagging.set(false);
    }
  }
}
