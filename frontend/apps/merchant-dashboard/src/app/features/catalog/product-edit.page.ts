import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi, ProductInput, VariantInput } from '@shopivo/api-client';
import { PRODUCT_STATUS_LABELS, Product, ProductImage, ProductStatus, ProductType, VAT_RATES } from '@shopivo/shared-models';
import { PendingImage, ProductImagesComponent } from './product-images';
import { CategoryTreeSelectComponent } from './category-tree';
import { OptionRow, VariantOptionsComponent } from './variant-options';
import { SeoPanelComponent } from './seo-panel';
import { ParcelFieldsComponent } from './parcel-fields';
import { industryOf } from './industries';
import { StorefrontAdminApi } from '@shopivo/api-client';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, FieldComponent, LoadingComponent, MoneyPipe,
  SelectComponent, SelectOption, ToastService, icons, moneyInput, parseMoney,
} from '@shopivo/shared-ui';
import { BackIconComponent } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface VariantRow {
  id: string | null;
  key: string;
  optionValues: Record<string, string>;
  title: string;
  price: string;
  compareAt: string;
  cost: string;
  sku: string;
  ean: string;
  stock: string;
  trackInventory: boolean;
  allowBackorder: boolean;
  onHand: number | null;
  lowest: number | null;
}

const MAX_VARIANTS = 100;

function emptyVariant(): VariantRow {
  return { id: null, key: '', optionValues: {}, title: '', price: '', compareAt: '', cost: '', sku: '', ean: '', stock: '0',
    trackInventory: true, allowBackorder: false, onHand: null, lowest: null };
}

/** Create / edit a product. Variants are generated from the options (all combinations, max. 100). */
@Component({
  selector: 'sv-product-edit-page',
  imports: [BackIconComponent, FormsModule, RouterLink, LucideDynamicIcon, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    FieldComponent, LoadingComponent, SelectComponent, DialogComponent, MoneyPipe, ProductImagesComponent, CategoryTreeSelectComponent,
    VariantOptionsComponent, SeoPanelComponent, ParcelFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <sv-loading class="mt-2" variant="detail" [rows]="6" label="Wczytywanie produktu…" />
    } @else if (loadError(); as e) {
      <sv-alert tone="error" class="mt-6">{{ e }}</sv-alert>
    } @else {
      <form (ngSubmit)="save()" novalidate>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <a sv-button variant="ghost" size="icon" class="group" [routerLink]="['/sklep', ctx.tenantId(), 'produkty']" aria-label="Wróć do produktów" title="Wróć">
              <sv-back-icon icon="products" />
            </a>
            <div class="min-w-0">
              <h1 class="truncate text-[22px] font-semibold tracking-[-0.01em] text-ink">{{ isNew() ? 'Nowy produkt' : (name || 'Produkt') }}</h1>
              @if (!isNew()) {<sv-badge class="mt-1" [tone]="status === 'ACTIVE' ? 'success' : status === 'ARCHIVED' ? 'warning' : 'neutral'">{{ statusLabels[status] }}</sv-badge>}
            </div>
          </div>
          @if (canWrite) {
            <div class="flex shrink-0 gap-2">
              @if (!isNew()) {
                <button sv-button type="button" variant="ghost" (click)="duplicate()" [loading]="duplicating()"><svg [lucideIcon]="icons.copy" />Duplikuj</button>
                <button sv-button type="button" variant="ghost" (click)="confirmDelete.set(true)"><svg [lucideIcon]="icons.trash" />Usuń</button>
              }
              <button sv-button type="submit" [loading]="saving()">{{ isNew() ? 'Dodaj produkt' : 'Zapisz zmiany' }}</button>
            </div>
          }
        </div>

        @if (error(); as e) {<sv-alert tone="error" class="mt-5">{{ e }}</sv-alert>}

        <fieldset class="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" [disabled]="!canWrite">
          <div class="min-w-0 space-y-4">
            <sv-card heading="Podstawowe informacje">
              <div class="space-y-4">
                <sv-field label="Nazwa produktu" for="p-name" info="Krótko i konkretnie: co to jest + najważniejsza cecha. Tak klienci szukają w Google, np. „Kubek ceramiczny 350 ml oliwkowy”.">
                  <input id="p-name" name="name" class="sv-input" maxlength="200" required [(ngModel)]="name" placeholder="np. Koszulka z bawełny organicznej" />
                </sv-field>
                <sv-field label="Opis" for="p-desc" [optional]="true" hint="Materiał, wymiary, zastosowanie, pielęgnacja. Pierwsze zdania pokażą się też w Google.">
                  <textarea id="p-desc" name="description" class="sv-input min-h-36 py-2.5" maxlength="20000" [(ngModel)]="description"></textarea>
                </sv-field>
              </div>
            </sv-card>

            <sv-product-images [tenantId]="ctx.tenantId()" [productId]="productId() ?? null" [canWrite]="canWrite" [(images)]="images" [(pending)]="pendingImages" />

            @if (!hasOptions()) {
              @let v = variants()[0];
              <sv-card heading="Cena i magazyn">
                <div class="grid gap-4 sm:grid-cols-3">
                  <sv-field label="Cena (brutto)" for="v0-price">
                    <input id="v0-price" name="v0-price" class="sv-input" inputmode="decimal" placeholder="0,00" [(ngModel)]="v.price" />
                  </sv-field>
                  <sv-field label="Cena przed obniżką" for="v0-compare" [optional]="true" hint="Przekreślona cena w sklepie"
                    info="Wpisz, gdy produkt jest w promocji — klient zobaczy przekreśloną starą cenę. Zgodnie z dyrektywą Omnibus sklep pokaże też najniższą cenę z 30 dni przed obniżką (liczymy ją sami).">
                    <input id="v0-compare" name="v0-compare" class="sv-input" inputmode="decimal" [(ngModel)]="v.compareAt" />
                  </sv-field>
                  <sv-field label="Koszt zakupu" for="v0-cost" [optional]="true" hint="Widoczny tylko dla Ciebie">
                    <input id="v0-cost" name="v0-cost" class="sv-input" inputmode="decimal" [(ngModel)]="v.cost" />
                  </sv-field>
                </div>
                @if (v.compareAt && v.lowest !== null) {
                  <p class="mt-3 text-[12px] text-ink-muted">Omnibus: najniższa cena z 30 dni przed obniżką — <strong class="font-medium text-ink">{{ v.lowest | svMoney }}</strong>.</p>
                }
                <div class="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <sv-field label="SKU" for="v0-sku" [optional]="true" info="Twój wewnętrzny kod produktu, np. KUB-350-OLI. Ułatwia magazyn i zamówienia. Widzisz go tylko Ty."><input id="v0-sku" name="v0-sku" class="sv-input" maxlength="64" [(ngModel)]="v.sku" /></sv-field>
                  <sv-field label="Kod EAN / GTIN" for="v0-ean" [optional]="true" info="Kod kreskowy z opakowania producenta (8–14 cyfr). Pomaga w Google Shopping i porównywarkach. Nie masz — zostaw puste."><input id="v0-ean" name="v0-ean" class="sv-input" inputmode="numeric" maxlength="14" [(ngModel)]="v.ean" /></sv-field>
                  @if (v.trackInventory) {
                    @if (v.onHand === null) {
                      <sv-field label="Stan początkowy" for="v0-stock"><input id="v0-stock" name="v0-stock" class="sv-input" type="number" min="0" [(ngModel)]="v.stock" /></sv-field>
                    } @else {
                      <div>
                        <p class="sv-label">Stan magazynowy</p>
                        <p class="mt-2 text-[14px] font-medium text-ink">{{ v.onHand }} szt.</p>
                        <a class="sv-link text-[12px]" [routerLink]="['/sklep', ctx.tenantId(), 'magazyn']" [queryParams]="{ q: v.sku || name }">Zmień w magazynie</a>
                      </div>
                    }
                  }
                </div>
                <div class="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="v0-track" [(ngModel)]="v.trackInventory" />Śledź stan magazynowy</label>
                  @if (v.trackInventory) {
                    <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="v0-back" [(ngModel)]="v.allowBackorder" />Sprzedawaj, gdy brak w magazynie</label>
                  }
                </div>
              </sv-card>
            }

            <sv-card heading="Warianty" subheading="Np. rozmiar i kolor. Z opcji powstają wszystkie kombinacje (maks. 100) — cenę i stan ustawisz dla każdej.">
              @if (!options().length) {
                <p class="mb-3 text-[13px] text-ink-muted">Produkt ma jeden wariant. Dodaj opcje, jeśli występuje w kilku rozmiarach, kolorach lub pojemnościach.</p>
              }
              <sv-variant-options [options]="options()" (optionsChange)="options.set($event); rebuild()" [industry]="industry()" [disabled]="!canWrite" />
              @if (options().length) {
                @if (tooMany()) {
                  <sv-alert tone="warning" class="mt-4">Za dużo kombinacji ({{ combinations() }}). Produkt może mieć najwyżej 100 wariantów.</sv-alert>
                } @else if (variants().length && hasOptions()) {
                  <div class="mt-5 flex flex-wrap items-end gap-2 rounded-[10px] bg-canvas p-3">
                    <p class="w-full text-[12px] font-medium text-ink-soft">Ustaw dla {{ bulkScopeLabel() }}:</p>
                    @if (bulkGroups().length > 1) {
                      <select class="sv-input !h-9 w-auto !text-[13px]" aria-label="Których wariantów dotyczy zmiana" [value]="bulkScope()" (change)="bulkScope.set($any($event.target).value)">
                        <option value="">wszystkich wariantów</option>
                        @for (g of bulkGroups(); track g) {<option [value]="g">tylko: {{ g }}</option>}
                      </select>
                    }
                    <input class="sv-input !h-9 w-28" inputmode="decimal" placeholder="Cena" aria-label="Cena dla zaznaczonych wariantów" [value]="bulkPrice()" (input)="bulkPrice.set($any($event.target).value)" />
                    @if (allTracked() && anyNew()) {
                      <input class="sv-input !h-9 w-24" type="number" min="0" placeholder="Stan" aria-label="Stan dla zaznaczonych wariantów" [value]="bulkStock()" (input)="bulkStock.set($any($event.target).value)" />
                    }
                    <button sv-button type="button" size="sm" variant="secondary" [disabled]="!bulkPrice().trim() && !bulkStock().trim()" (click)="applyBulk(bulkPrice(), bulkStock())">Zastosuj</button>
                  </div>
                  <div class="-mx-5 mt-4 overflow-x-auto border-t border-line px-5 pt-3">
                    <table class="sv-table min-w-[640px]">
                      <thead><tr><th scope="col">Wariant</th><th scope="col">Cena (brutto)</th><th scope="col">Przed obniżką</th><th scope="col">SKU</th><th scope="col">EAN</th><th scope="col">Stan</th></tr></thead>
                      <tbody>
                        @for (v of variants(); track v.key; let i = $index) {
                          <tr>
                            <td class="whitespace-nowrap font-medium text-ink">{{ v.title }}</td>
                            <td><input class="sv-input !h-9 w-24" inputmode="decimal" [name]="'vp-' + i" [attr.aria-label]="'Cena ' + v.title" [(ngModel)]="v.price" /></td>
                            <td><input class="sv-input !h-9 w-24" inputmode="decimal" [name]="'vc-' + i" [attr.aria-label]="'Cena przed obniżką ' + v.title" [(ngModel)]="v.compareAt" />
                              @if (v.compareAt && v.lowest !== null) {<span class="mt-1 block text-[11px] text-ink-muted">min. 30 dni: {{ v.lowest | svMoney }}</span>}</td>
                            <td><input class="sv-input !h-9 w-28" maxlength="64" [name]="'vs-' + i" [attr.aria-label]="'SKU ' + v.title" [(ngModel)]="v.sku" /></td>
                            <td><input class="sv-input !h-9 w-32" inputmode="numeric" maxlength="14" [name]="'ve-' + i" [attr.aria-label]="'EAN ' + v.title" [(ngModel)]="v.ean" /></td>
                            <td>
                              @if (!v.trackInventory) {<span class="text-ink-muted">nie śledzony</span>}
                              @else if (v.onHand === null) {<input class="sv-input !h-9 w-16" type="number" min="0" [name]="'vq-' + i" [attr.aria-label]="'Stan ' + v.title" [(ngModel)]="v.stock" />}
                              @else {<span class="tabular-nums">{{ v.onHand }} szt.</span>}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="all-track"
                      [ngModel]="allTracked()" (ngModelChange)="setTracking($event)" />Śledź stany</label>
                    <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="all-back"
                      [ngModel]="allBackorder()" (ngModelChange)="setBackorder($event)" />Sprzedawaj przy braku</label>
                  </div>
                }
              }
            </sv-card>

            @if (type === 'PHYSICAL') {
              <sv-parcel-fields [(weight)]="weight" [(length)]="length" [(width)]="width" [(height)]="height" [industry]="industry()"
                [disabled]="!canWrite" [variantsNote]="hasOptions()" />
            }

            <sv-seo-panel [name]="name" [text]="description" [brand]="brandName()" [storeName]="ctx.store()?.name ?? ''" [host]="ctx.store()?.primaryHostname ?? ''"
              [(slug)]="slug" [(title)]="seoTitle" [(description)]="seoDescription" [disabled]="!canWrite" />
          </div>

          <div class="min-w-0 space-y-4">
            <sv-card heading="Status">
              <sv-select inputId="p-status" name="status" [options]="statusOptions" [(ngModel)]="status" ariaLabel="Status produktu" />
            </sv-card>

            <sv-card heading="Organizacja">
              <div class="space-y-4">
                <sv-field label="Typ produktu" for="p-type">
                  <sv-select inputId="p-type" name="type" [options]="typeOptions" [(ngModel)]="type" ariaLabel="Typ produktu" />
                </sv-field>
                <sv-field label="Stawka VAT" for="p-vat">
                  <sv-select inputId="p-vat" name="vat" [options]="vatOptions" [(ngModel)]="vat" ariaLabel="Stawka VAT" />
                </sv-field>
                <sv-field label="Marka" for="p-brand" [optional]="true">
                  <sv-select inputId="p-brand" name="brand" [options]="brandOptions()" [(ngModel)]="brandId" ariaLabel="Marka" />
                </sv-field>
                @if (canWrite) {
                  <div class="flex gap-2">
                    <input class="sv-input !h-9" name="newBrand" placeholder="Nowa marka" aria-label="Nazwa nowej marki" maxlength="120" [(ngModel)]="newBrand" />
                    <button sv-button type="button" size="sm" variant="secondary" [disabled]="!newBrand.trim()" (click)="addBrand()">Dodaj</button>
                  </div>
                }
              </div>
            </sv-card>

            <sv-card heading="Kategorie" [flush]="true">
              <div card-actions><a class="sv-link text-[12px]" [routerLink]="['/sklep', ctx.tenantId(), 'kategorie']">Zarządzaj</a></div>
              @if (!categories.value()?.length) {
                <p class="px-5 pb-5 text-[13px] text-ink-muted">Nie masz jeszcze kategorii — pomagają klientom znaleźć produkt.
                  <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'kategorie']">Utwórz kategorie</a></p>
              } @else {
                <sv-category-tree-select [categories]="categories.value() ?? []" [value]="categoryIds()" (valueChange)="categoryIds.set($event)" [disabled]="!canWrite" />
              }
            </sv-card>
          </div>
        </fieldset>
      </form>
    }

    <sv-dialog heading="Usunąć produkt?" [open]="confirmDelete()" (closed)="confirmDelete.set(false)">
      Produkt „{{ name }}” zostanie usunięty razem z wariantami i historią stanów. Tej operacji nie można cofnąć —
      jeśli chcesz tylko ukryć produkt, zmień status na „Zarchiwizowany”.
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="confirmDelete.set(false)">Anuluj</button>
        <button sv-button variant="danger" type="button" [loading]="saving()" (click)="remove()">Usuń produkt</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class ProductEditPage implements OnInit {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(CatalogApi);
  private readonly media = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly statusLabels = PRODUCT_STATUS_LABELS;
  protected readonly canWrite = this.ctx.can('PRODUCTS_WRITE');

  /** Route parameter; absent for "nowy". */
  readonly productId = input<string>();

  protected readonly statusOptions: SelectOption[] = [
    { value: 'DRAFT', label: 'Szkic', description: 'Niewidoczny w sklepie' },
    { value: 'ACTIVE', label: 'Aktywny', description: 'Widoczny i dostępny do kupienia' },
    { value: 'ARCHIVED', label: 'Zarchiwizowany', description: 'Ukryty, nie wlicza się do limitu planu' },
  ];
  protected readonly typeOptions: SelectOption[] = [
    { value: 'PHYSICAL', label: 'Fizyczny', description: 'Wymaga wysyłki' },
    { value: 'DIGITAL', label: 'Cyfrowy', description: 'Plik lub usługa, bez wysyłki' },
  ];
  protected readonly vatOptions: SelectOption[] = VAT_RATES.map((r) => ({ value: String(r.bps), label: r.label }));

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly duplicating = signal(false);
  protected readonly confirmDelete = signal(false);

  protected name = '';
  protected description = '';
  protected slug = '';
  protected seoTitle = '';
  protected seoDescription = '';
  protected status: ProductStatus = 'DRAFT';
  protected type: ProductType = 'PHYSICAL';
  protected vat = '2300';
  protected brandId = '';
  protected newBrand = '';
  protected weight: number | null = null;
  protected length: number | null = null;
  protected width: number | null = null;
  protected height: number | null = null;
  private version = 0;

  protected readonly options = signal<OptionRow[]>([]);
  protected readonly variants = signal<VariantRow[]>([emptyVariant()]);
  protected readonly categoryIds = signal<string[]>([]);
  protected readonly pendingImages = signal<PendingImage[]>([]);
  protected readonly industry = computed(() => this.ctx.store()?.industry ?? null);
  protected readonly images = signal<ProductImage[]>([]);
  protected readonly combinations = signal(1);

  protected readonly categories = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.categories(params) });
  protected readonly brands = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.brands(params) });

  protected readonly isNew = computed(() => !this.productId());
  protected readonly hasOptions = computed(() => this.parsedOptions().length > 0);
  protected readonly tooMany = computed(() => this.combinations() > MAX_VARIANTS);
  protected readonly allTracked = computed(() => this.variants().every((v) => v.trackInventory));
  protected readonly allBackorder = computed(() => this.variants().every((v) => v.allowBackorder));
  protected readonly brandOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Bez marki' }, ...(this.brands.value() ?? []).map((b) => ({ value: b.id, label: b.name })),
  ]);

  ngOnInit(): void {
    const id = this.productId();
    if (id) void this.load(id);
    else this.type = industryOf(this.industry())?.productType ?? 'PHYSICAL';
  }

  protected brandName(): string | null {
    return (this.brands.value() ?? []).find((b) => b.id === this.brandId)?.name ?? null;
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.fill(await firstValueFrom(this.api.product(this.ctx.tenantId(), id)));
    } catch (e) {
      this.loadError.set(ApiError.from(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  private fill(p: Product): void {
    this.name = p.name;
    this.description = p.description ?? '';
    this.slug = p.slug;
    this.seoTitle = p.seoTitle ?? '';
    this.seoDescription = p.seoDescription ?? '';
    this.status = p.status;
    this.type = p.type;
    this.vat = String(p.vatRateBps);
    this.brandId = p.brand?.id ?? '';
    this.version = p.version;
    const first = p.variants[0];
    this.weight = first?.weightGrams ?? null;
    this.length = first?.lengthMm ?? null;
    this.width = first?.widthMm ?? null;
    this.height = first?.heightMm ?? null;
    this.options.set(p.options.map((o) => ({ name: o.name, values: [...o.values] })));
    this.categoryIds.set(p.categories.map((c) => c.id));
    this.images.set(p.images ?? []);
    this.variants.set(p.variants.map((v) => ({
      id: v.id, key: keyOf(v.optionValues), optionValues: v.optionValues, title: v.title || 'Domyślny',
      price: moneyInput(v.priceMinor), compareAt: moneyInput(v.compareAtMinor), cost: moneyInput(v.costMinor), sku: v.sku ?? '',
      ean: v.ean ?? '', stock: '0', trackInventory: v.trackInventory, allowBackorder: v.allowBackorder,
      onHand: v.trackInventory ? v.onHand : null, lowest: v.compareAtMinor ? v.lowestPrice30dMinor : null,
    })));
    this.combinations.set(this.variants().length);
  }

  private parsedOptions(): { name: string; values: string[] }[] {
    return this.options()
      .map((o) => ({ name: o.name.trim(), values: [...new Set(o.values.map((v) => v.trim()).filter(Boolean))] }))
      .filter((o) => o.name && o.values.length);
  }

  /** Regenerates the variant rows from the options, keeping what was typed for combinations that still exist. */
  protected rebuild(): void {
    const opts = this.parsedOptions();
    const total = opts.reduce((n, o) => n * o.values.length, 1);
    this.combinations.set(total);
    if (total > MAX_VARIANTS) return;
    const previous = new Map(this.variants().map((v) => [v.key, v]));
    const template = this.variants()[0] ?? emptyVariant();
    let combos: Record<string, string>[] = [{}];
    for (const o of opts) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v })));
    if (!opts.length) {
      // Back to a single variant: keep the first one (with its id, so its stock and history are preserved).
      this.variants.set([{ ...template, key: '', optionValues: {}, title: 'Domyślny' }]);
      return;
    }
    const single = previous.size === 1 && previous.has('') ? previous.get('')! : null;
    this.variants.set(combos.map((values, i) => {
      const key = keyOf(values);
      const existing = previous.get(key) ?? (i === 0 && single ? single : undefined);
      return existing
        ? { ...existing, key, optionValues: values, title: Object.values(values).join(' / ') }
        : { ...emptyVariant(), key, optionValues: values, title: Object.values(values).join(' / '), price: template.price,
            trackInventory: template.trackInventory, allowBackorder: template.allowBackorder };
    }));
  }

  /** Bulk edit scope: all variants or those with one value of the first option (e.g. only size M). */
  protected readonly bulkScope = signal('');
  protected readonly bulkPrice = signal('');
  protected readonly bulkStock = signal('');
  protected readonly bulkGroups = computed(() => this.parsedOptionsSignal()[0]?.values ?? []);
  protected readonly anyNew = computed(() => this.variants().some((v) => v.onHand === null));
  protected bulkScopeLabel(): string {
    const scope = this.bulkScope();
    const first = this.parsedOptionsSignal()[0]?.name;
    return scope && first ? `wariantów: ${first} ${scope}` : 'wszystkich wariantów';
  }

  private parsedOptionsSignal() {
    this.options();
    return this.parsedOptions();
  }

  protected applyBulk(priceText: string, stockText: string): void {
    const first = this.parsedOptions()[0]?.name;
    const scope = this.bulkScope();
    const price = priceText.trim() ? parseMoney(priceText) : null;
    if (priceText.trim() && (price === null || price === undefined)) {
      this.toast.error('Podaj prawidłową cenę, np. 79,90.');
      return;
    }
    const stock = stockText.trim();
    this.variants.update((vs) => vs.map((v) => {
      if (scope && first && v.optionValues[first] !== scope) return v;
      return { ...v, price: price !== null && price !== undefined ? priceText.trim() : v.price,
        stock: stock && v.onHand === null ? String(Math.max(0, Math.floor(Number(stock) || 0))) : v.stock };
    }));
    this.bulkPrice.set('');
    this.bulkStock.set('');
  }

  protected setTracking(on: boolean): void {
    this.variants.update((vs) => vs.map((v) => ({ ...v, trackInventory: on, allowBackorder: on ? v.allowBackorder : false })));
  }

  protected setBackorder(on: boolean): void {
    this.variants.update((vs) => vs.map((v) => ({ ...v, allowBackorder: on })));
  }

  protected async addBrand(): Promise<void> {
    try {
      const brand = await firstValueFrom(this.api.createBrand(this.ctx.tenantId(), this.newBrand.trim()));
      this.newBrand = '';
      this.brands.reload();
      this.brandId = brand.id;
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  private buildInput(): ProductInput | string {
    if (!this.name.trim()) return 'Podaj nazwę produktu.';
    if (this.tooMany()) return 'Za dużo wariantów — ogranicz liczbę wartości opcji.';
    const opts = this.parsedOptions();
    if (this.options().length !== opts.length) return 'Każda opcja musi mieć nazwę i co najmniej jedną wartość.';
    const variants: VariantInput[] = [];
    for (const v of this.variants()) {
      const label = v.title && opts.length ? ` (${v.title})` : '';
      const price = parseMoney(v.price);
      if (price === null || price === undefined) return `Podaj prawidłową cenę${label}, np. 79,90.`;
      const compareAt = parseMoney(v.compareAt);
      const cost = parseMoney(v.cost);
      if (compareAt === undefined || cost === undefined) return `Nieprawidłowa kwota${label}.`;
      const stock = v.onHand === null && v.trackInventory ? Number(v.stock || 0) : null;
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return `Stan musi być liczbą całkowitą ≥ 0${label}.`;
      variants.push({
        id: v.id, optionValues: v.optionValues, sku: v.sku.trim() || null, ean: v.ean.trim() || null, priceMinor: price,
        compareAtMinor: compareAt, costMinor: cost, weightGrams: num(this.weight), lengthMm: num(this.length),
        widthMm: num(this.width), heightMm: num(this.height), trackInventory: v.trackInventory, allowBackorder: v.allowBackorder,
        initialStock: stock,
      });
    }
    return {
      name: this.name.trim(), slug: this.slug.trim() || null, description: this.description.trim() || null, status: this.status,
      type: this.type, brandId: this.brandId || null, vatRateBps: Number(this.vat), categoryIds: [...this.categoryIds()],
      seoTitle: this.seoTitle.trim() || null, seoDescription: this.seoDescription.trim() || null, options: opts, variants,
      version: this.version,
    };
  }

  protected async save(): Promise<void> {
    const input = this.buildInput();
    if (typeof input === 'string') {
      this.error.set(input);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const tenant = this.ctx.tenantId();
      const id = this.productId();
      const saved = id ? await firstValueFrom(this.api.updateProduct(tenant, id, input))
        : await firstValueFrom(this.api.createProduct(tenant, input));
      this.toast.success(id ? 'Zapisano zmiany.' : 'Dodano produkt.');
      if (id) {
        this.fill(saved);
      } else {
        await this.uploadPending(tenant, saved.id);
        await this.router.navigate(['/sklep', tenant, 'produkty', saved.id], { replaceUrl: true });
      }
    } catch (e) {
      const err = ApiError.from(e);
      this.error.set(err.message);
      if (err.code === 'VERSION_CONFLICT') this.toast.error(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  /** Photos chosen before the product existed: uploaded in order once it is created; failures are reported, not fatal. */
  private async uploadPending(tenant: string, productId: string): Promise<void> {
    const pending = this.pendingImages();
    let failed = 0;
    for (const p of pending) {
      try {
        await firstValueFrom(this.media.uploadImage(tenant, productId, p.file, p.alt.trim() || null));
      } catch {
        failed++;
      } finally {
        URL.revokeObjectURL(p.url);
      }
    }
    this.pendingImages.set([]);
    if (failed) this.toast.error(`Nie udało się wysłać ${failed} zdj. — dodaj je ponownie w produkcie.`);
  }

  protected async duplicate(): Promise<void> {
    this.duplicating.set(true);
    try {
      const copy = await firstValueFrom(this.api.duplicateProduct(this.ctx.tenantId(), this.productId()!));
      this.toast.success('Utworzono kopię jako szkic.');
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'produkty', copy.id]);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.duplicating.set(false);
    }
  }

  protected async remove(): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.deleteProduct(this.ctx.tenantId(), this.productId()!));
      this.toast.success('Usunięto produkt.');
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'produkty']);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
      this.confirmDelete.set(false);
    }
  }
}

function keyOf(values: Record<string, string>): string {
  return Object.entries(values).map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`).join('|');
}

function num(v: number | string | null): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
