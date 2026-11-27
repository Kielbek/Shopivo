import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi } from '@shopivo/api-client';
import { Brand, Category } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent, FieldComponent,
  LoadingComponent, PageHeaderComponent, SelectComponent, SelectOption, ToastService, icons, plural, slugify,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ART_BACKGROUNDS, ART_MOTIFS, ArtBackground, ArtMotif, artSvg, renderArtPng, suggestBackground, suggestMotif } from './category-art';
import { StoreContext } from '../store/store-context';
import { buildTree } from './category-tree';
import { SeoPanelComponent } from './seo-panel';
import { StarterCategory, industryLabels, starterCategoriesFor, storeIndustries } from './industries';

interface CategoryForm {
  id: string | null; name: string; slug: string; description: string; parentId: string; visible: boolean;
  seoTitle: string; seoDescription: string; version: number;
}

@Component({
  selector: 'sv-categories-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, EmptyStateComponent, DialogComponent, FieldComponent, SelectComponent, SeoPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Kategorie i marki" description="Drzewo kategorii (do 5 poziomów) porządkuje katalog i nawigację sklepu.">
      @if (canWrite) {<button sv-button (click)="open(null, null)"><svg [lucideIcon]="icons.folderPlus" />Nowa kategoria</button>}
    </sv-page-header>

    @if (canWrite && starter(); as st) {
      @if (st.missing.length) {
        <section class="sv-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center" aria-labelledby="starter-heading">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary"><svg [lucideIcon]="icons.sparkles" [size]="20" /></span>
          <div class="min-w-0 flex-1">
            <h2 id="starter-heading" class="text-[14px] font-semibold text-ink">Propozycja kategorii dla branży: {{ st.label }}</h2>
            <p class="mt-0.5 text-[13px] text-ink-soft">{{ st.preview }}</p>
            <p class="mt-1 text-[12px] text-ink-muted">Dodamy {{ plural(st.count, 'kategorię', 'kategorie', 'kategorii') }} (istniejące pominiemy). Potem możesz je zmieniać i usuwać.</p>
          </div>
          <button sv-button class="shrink-0" [loading]="seeding()" (click)="seed(st.missing)"><svg [lucideIcon]="icons.plus" />Dodaj propozycje</button>
        </section>
      }
    } @else if (canWrite && !hasIndustry() && !tree().length) {
      <sv-alert class="mt-6">Wybierz branżę sklepu w <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'ustawienia']">Ustawieniach</a>, a zaproponujemy gotowe kategorie.</sv-alert>
    }

    <div class="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" [class.items-start]="!bothEmpty()">
      <sv-card heading="Kategorie" [flush]="true">
        @if (canWrite && withoutImage().length) {
          <button card-actions sv-button variant="tonal" size="sm" (click)="bulkOpen.set(true)"><svg [lucideIcon]="icons.image" />Grafiki dla kategorii</button>
        }
        @if (categories.isLoading() && !categories.value()) {
          <sv-loading />
        } @else if (categories.error()) {
          <div class="px-5 pb-5"><sv-alert tone="error">Nie udało się wczytać kategorii.</sv-alert></div>
        } @else if (!tree().length) {
          <sv-empty-state icon="categories" illustration="categories" title="Brak kategorii" description="Np. Odzież → Koszulki, Bluzy.">
            @if (canWrite) {<button sv-button class="mt-4" (click)="open(null, null)"><svg [lucideIcon]="icons.plus" />Dodaj kategorię</button>}
          </sv-empty-state>
        } @else {
          <div class="flex items-center justify-between gap-3 px-5 pb-2 text-[12px] text-ink-muted">
            <span>{{ plural(tree().length, 'kategoria', 'kategorie', 'kategorii') }} · {{ roots() }} {{ roots() === 1 ? 'główna' : 'głównych' }}</span>
            <span class="flex gap-3">
              <button type="button" class="hover:text-ink" (click)="collapsed.set(allParents())">Zwiń wszystkie</button>
              <button type="button" class="hover:text-ink" (click)="collapsed.set(emptySet())">Rozwiń wszystkie</button>
            </span>
          </div>
          <ul class="px-3 pb-3" role="tree" aria-label="Drzewo kategorii">
            @for (n of visibleTree(); track n.category.id) {
              @let c = n.category;
              <li role="treeitem" [attr.aria-level]="n.depth + 1" [attr.aria-expanded]="n.childCount ? !collapsed().has(c.id) : null"
                class="group relative flex items-center gap-2 rounded-[10px] py-1.5 pr-2 hover:bg-hover" [style.padding-left.px]="8 + n.depth * 28">
                @for (d of guides(n.depth); track $index) {
                  <span class="absolute bottom-0 top-0 border-l border-line" [style.left.px]="20 + d * 28" aria-hidden="true"></span>
                }
                @if (n.childCount) {
                  <button type="button" class="relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-muted hover:bg-canvas hover:text-ink"
                    [attr.aria-label]="(collapsed().has(c.id) ? 'Rozwiń ' : 'Zwiń ') + c.name" (click)="toggle(c.id)">
                    <svg [lucideIcon]="collapsed().has(c.id) ? icons.chevronRight : icons.chevronDown" [size]="14" />
                  </button>
                } @else {
                  <span class="size-6 shrink-0"></span>
                }
                @if (c.image?.['w400']; as thumb) {
                  <img [src]="thumb" alt="" class="size-8 shrink-0 rounded-[8px] object-cover" loading="lazy" />
                } @else {
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px]" [class]="n.depth === 0 ? 'bg-primary-soft text-primary' : 'bg-canvas text-ink-muted'">
                    <svg [lucideIcon]="n.childCount ? icons.categories : icons.tag" [size]="15" />
                  </span>
                }
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] text-ink" [class.font-semibold]="n.depth === 0" [class.font-medium]="n.depth > 0">{{ c.name }}
                    @if (!c.visible) {<sv-badge class="ml-1.5">Ukryta</sv-badge>}
                    @if (n.childCount) {<span class="ml-1 text-[12px] font-normal text-ink-muted">· {{ plural(n.childCount, 'podkategoria', 'podkategorie', 'podkategorii') }}</span>}</p>
                  <p class="truncate text-[12px] text-ink-muted">
                    <a class="hover:text-ink" [routerLink]="['/sklep', ctx.tenantId(), 'produkty']" [queryParams]="{ kategoria: c.id }">{{ productsLabel(c.productCount) }}</a>
                    · /kategoria/{{ c.slug }}</p>
                </div>
                @if (canWrite) {
                  <div class="flex shrink-0 gap-1 sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    @if (n.depth < 4) {
                      <button sv-button variant="ghost" size="sm" (click)="open(null, c.id)" [attr.aria-label]="'Dodaj podkategorię do ' + c.name">
                        <svg [lucideIcon]="icons.plus" /><span class="hidden sm:inline">Podkategoria</span></button>
                    }
                    <button sv-button variant="ghost" size="icon" (click)="open(c, c.parentId)" [attr.aria-label]="'Edytuj ' + c.name"><svg [lucideIcon]="icons.pencil" /></button>
                    <button sv-button variant="ghost" size="icon" (click)="toDelete.set(c)" [attr.aria-label]="'Usuń ' + c.name"><svg [lucideIcon]="icons.trash" /></button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </sv-card>

      <sv-card heading="Marki" [flush]="true">
        @if (canWrite) {
          <form class="flex gap-2 px-5 pb-3" (ngSubmit)="addBrand()">
            <input class="sv-input" name="brand" placeholder="Nazwa marki" aria-label="Nazwa nowej marki" maxlength="120" [(ngModel)]="brandName" />
            <button sv-button type="submit" variant="secondary" [disabled]="!brandName.trim()">Dodaj</button>
          </form>
        }
        @if (!brands.value()?.length) {
          <sv-empty-state icon="tag" illustration="brands" title="Brak marek"
            [description]="canWrite ? 'Wpisz nazwę marki powyżej — np. producenta, którego produkty sprzedajesz. Marka pokaże się przy produkcie.' : 'Sklep nie ma jeszcze żadnej marki.'" />
        } @else {
          <ul class="px-5 pb-3">
            @for (b of brands.value(); track b.id) {
              <li class="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                <span class="min-w-0"><span class="block truncate text-[13px] font-medium text-ink">{{ b.name }}</span>
                  <span class="text-[12px] text-ink-muted">{{ productsLabel(b.productCount) }}</span></span>
                @if (canWrite) {
                  <button sv-button variant="ghost" size="icon" (click)="deleteBrand(b)" [attr.aria-label]="'Usuń markę ' + b.name"><svg [lucideIcon]="icons.trash" /></button>
                }
              </li>
            }
          </ul>
        }
      </sv-card>
    </div>

    <sv-dialog heading="Gotowe grafiki dla kategorii" [open]="bulkOpen()" (closed)="bulkBusy() || bulkOpen.set(false)">
      <p class="text-[13.5px] text-ink-soft">Dobierzemy grafikę do nazwy każdej kategorii bez zdjęcia ({{ withoutImage().length }}). Pojawią się w sekcji „Kategorie” na stronie
        głównej sklepu. Każdą możesz potem zmienić w edycji kategorii.</p>
      <ul class="mt-4 grid max-h-[46vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
        @for (c of withoutImage(); track c.id) {
          <li class="min-w-0">
            <span class="block overflow-hidden rounded-[10px] border border-line" [innerHTML]="artPreview(suggest(c.name), suggestBg(c.name))"></span>
            <p class="mt-1 truncate text-[12px] text-ink" [title]="c.name">{{ c.name }}</p>
          </li>
        }
      </ul>
      @if (bulkBusy()) {<p class="mt-3 text-[12.5px] text-ink-muted" aria-live="polite">Dodano {{ bulkDone() }} z {{ bulkTotal() }}…</p>}
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" [disabled]="bulkBusy()" (click)="bulkOpen.set(false)">Anuluj</button>
        <button sv-button type="button" [loading]="bulkBusy()" (click)="bulkArt()">Dodaj grafiki</button>
      </ng-container>
    </sv-dialog>

    <sv-dialog [heading]="form()?.id ? 'Edytuj kategorię' : 'Nowa kategoria'" [open]="!!form()" (closed)="close()">
      @if (form(); as f) {
        <form id="category-form" class="space-y-4" (ngSubmit)="save()">
          @if (error(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
          <sv-field label="Nazwa" for="c-name"><input id="c-name" name="name" class="sv-input" maxlength="120" required [(ngModel)]="f.name" /></sv-field>
          <sv-field label="Kategoria nadrzędna" for="c-parent" info="Podkategoria wyświetla się w sklepie pod wybraną kategorią, np. Odzież › Damskie › Sukienki. Wybierz „Brak”, aby utworzyć kategorię główną.">
            <sv-select inputId="c-parent" name="parent" [options]="parentOptions()" [(ngModel)]="f.parentId" ariaLabel="Kategoria nadrzędna" />
          </sv-field>
          <sv-field label="Opis" for="c-desc" [optional]="true"><textarea id="c-desc" name="desc" class="sv-input min-h-20 py-2.5" maxlength="2000" [(ngModel)]="f.description"></textarea></sv-field>
          <div>
            <p class="sv-label">Zdjęcie kategorii <span class="font-normal text-ink-muted">(opcjonalne)</span></p>
            @if (f.id) {
              <div class="mt-1.5 flex items-center gap-3 rounded-[10px] border-2 border-dashed p-2 transition-colors"
                [class]="imageOver() ? 'border-primary bg-primary-soft' : 'border-line'"
                (dragover)="$event.preventDefault(); imageOver.set(true)" (dragleave)="imageOver.set(false)" (drop)="dropImage($event, f.id)">
                <span class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-canvas text-ink-muted">
                  @if (imageBusy()) {<span class="sv-shimmer block size-full"></span>}
                  @else if (formImage(); as img) {<img [src]="img" alt="" class="size-full object-cover" />}
                  @else {<svg [lucideIcon]="icons.image" [size]="20" />}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <button type="button" class="text-[13px] font-medium text-primary-strong hover:underline disabled:opacity-50" [disabled]="imageBusy()" (click)="imageFile.click()">
                      {{ formImage() ? 'Zmień zdjęcie' : 'Dodaj zdjęcie' }}</button>
                    <button type="button" class="text-[13px] font-medium text-primary-strong hover:underline disabled:opacity-50" [disabled]="imageBusy()" (click)="toggleArt(f.name)">
                      {{ artOpen() ? 'Ukryj gotowe grafiki' : 'Gotowa grafika' }}</button>
                    @if (formImage()) {
                      <button type="button" class="text-[13px] text-ink-muted hover:text-danger-ink disabled:opacity-50" [disabled]="imageBusy()" (click)="removeImage(f.id)">Usuń</button>
                    }
                  </div>
                  <p class="mt-0.5 text-[12px] text-ink-muted">Pokazuje się w sekcji „Kategorie” na stronie głównej sklepu. Przeciągnij plik albo wybierz z dysku — JPEG lub PNG, najlepiej kwadrat min. 800 px.</p>
                </div>
                <input #imageFile type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept="image/jpeg,image/png" (change)="pickImage($event, f.id)" />
              </div>
              @if (artOpen()) {
                <div class="mt-2 rounded-[12px] border border-line p-3" role="group" aria-label="Gotowe grafiki">
                  <div class="flex gap-3">
                    <span class="block w-24 shrink-0 self-start overflow-hidden rounded-[10px] border border-line leading-[0]" [innerHTML]="artPreview(artMotif(), artBg())"></span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-medium text-ink">{{ artMotif().label }}</p>
                      <p class="mt-0.5 text-[12px] text-ink-muted">Płaska grafika w stylu Shopivo, w formacie kafelka kategorii (4:5). Zapiszemy ją jako zdjęcie kategorii — możesz ją później zmienić.</p>
                      <div class="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kolor tła">
                        @for (bg of backgrounds; track bg.id) {
                          <button type="button" role="radio" class="size-7 rounded-full border-2 transition-transform hover:scale-110" [style.background]="bg.color"
                            [class]="artBg().id === bg.id ? 'border-ink' : 'border-white shadow-[0_0_0_1px_var(--color-line)]'" [attr.aria-checked]="artBg().id === bg.id"
                            [attr.aria-label]="'Tło: ' + bg.label" (click)="artBg.set(bg)"></button>
                        }
                      </div>
                    </div>
                  </div>
                  <div class="mt-3 grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8" role="radiogroup" aria-label="Motyw">
                    @for (m of motifs; track m.id) {
                      <button type="button" role="radio" class="overflow-hidden rounded-[8px] border-2 transition-colors" [class]="artMotif().id === m.id ? 'border-ink' : 'border-transparent hover:border-line-strong'"
                        [attr.aria-checked]="artMotif().id === m.id" [attr.aria-label]="m.label" [title]="m.label" (click)="artMotif.set(m)" [innerHTML]="artPreview(m, artBg())"></button>
                    }
                  </div>
                  <div class="mt-3 flex justify-end">
                    <button sv-button size="sm" type="button" [loading]="imageBusy()" (click)="useArt(f.id)">Użyj grafiki</button>
                  </div>
                </div>
              }
            } @else {
              <p class="mt-1 text-[12px] text-ink-muted">Zdjęcie dodasz po zapisaniu kategorii.</p>
            }
          </div>
          <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="visible" [(ngModel)]="f.visible" />Widoczna w sklepie</label>
          <sv-seo-panel idPrefix="c" kind="category" pathPrefix="/kategoria/" [name]="f.name" [text]="f.description" [storeName]="ctx.store()?.name ?? ''"
            [host]="ctx.store()?.primaryHostname ?? ''" [(slug)]="f.slug" [(title)]="f.seoTitle" [(description)]="f.seoDescription" />
        </form>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="close()">Anuluj</button>
        <button sv-button type="submit" form="category-form" [loading]="saving()">Zapisz</button>
      </ng-container>
    </sv-dialog>

    <sv-dialog heading="Usunąć kategorię?" [open]="!!toDelete()" (closed)="toDelete.set(null)">
      Kategoria „{{ toDelete()?.name }}” zostanie usunięta. Produkty pozostaną w katalogu — stracą tylko przypisanie do niej.
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="toDelete.set(null)">Anuluj</button>
        <button sv-button variant="danger" type="button" [loading]="saving()" (click)="remove()">Usuń</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class CategoriesPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('PRODUCTS_WRITE');

  protected readonly categories = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.categories(params) });
  protected readonly brands = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.brands(params) });
  protected readonly form = signal<CategoryForm | null>(null);
  protected readonly toDelete = signal<Category | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected brandName = '';
  protected readonly formImage = signal<string | null>(null);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly motifs = ART_MOTIFS;
  protected readonly backgrounds = ART_BACKGROUNDS;
  protected readonly artOpen = signal(false);
  protected readonly artMotif = signal<ArtMotif>(ART_MOTIFS.at(-1)!);
  protected readonly artBg = signal<ArtBackground>(ART_BACKGROUNDS[0]!);
  protected readonly bulkOpen = signal(false);
  protected readonly bulkBusy = signal(false);
  protected readonly bulkDone = signal(0);
  protected readonly bulkTotal = signal(0);
  private readonly previews = new Map<string, SafeHtml>();
  protected readonly withoutImage = computed(() => (this.categories.value() ?? []).filter((c) => !c.image));
  protected readonly imageBusy = signal(false);
  protected readonly imageOver = signal(false);

  protected readonly plural = plural;
  protected readonly nodes = computed(() => buildTree(this.categories.value() ?? []));
  /** Both lists empty: the two cards stretch to the same height so their bottom edges line up. */
  protected readonly bothEmpty = computed(() => !!this.categories.value() && !!this.brands.value() && !this.tree().length && !this.brands.value()!.length);
  protected readonly tree = computed(() => this.nodes().map((n) => n.category));
  protected readonly collapsed = signal(new Set<string>());
  protected readonly seeding = signal(false);
  protected readonly visibleTree = computed(() => {
    const hidden = this.collapsed();
    return this.nodes().filter((n) => !n.ancestors.some((a) => hidden.has(a)));
  });
  protected readonly roots = computed(() => this.nodes().filter((n) => n.depth === 0).length);

  protected readonly hasIndustry = computed(() => storeIndustries(this.ctx.store()).length > 0);

  /** Starter categories for the store's industries that do not exist yet (matched by name under the same parent). */
  protected readonly starter = computed(() => {
    const ids = storeIndustries(this.ctx.store());
    const starters = starterCategoriesFor(ids);
    if (!starters.length || !this.categories.hasValue()) return null;
    const existing = this.nodes();
    const rootByName = new Map(existing.filter((n) => n.depth === 0).map((n) => [n.category.name.toLowerCase(), n.category.id]));
    const missing: StarterCategory[] = [];
    let count = 0;
    for (const c of starters) {
      const rootId = rootByName.get(c.name.toLowerCase());
      const childNames = new Set(existing.filter((n) => rootId && n.category.parentId === rootId).map((n) => n.category.name.toLowerCase()));
      const children = (c.children ?? []).filter((ch) => !childNames.has(ch.toLowerCase()));
      if (!rootId || children.length) {
        missing.push({ name: c.name, children });
        count += (rootId ? 0 : 1) + children.length;
      }
    }
    const preview = starters.map((c) => (c.children?.length ? `${c.name} (${c.children.join(', ')})` : c.name)).join(' · ');
    return { label: industryLabels(ids), missing, count, preview };
  });

  protected guides(depth: number): number[] {
    return Array.from({ length: depth }, (_, i) => i);
  }

  protected toggle(id: string): void {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.collapsed.set(next);
  }

  protected allParents(): Set<string> {
    return new Set(this.nodes().filter((n) => n.childCount).map((n) => n.category.id));
  }

  protected emptySet(): Set<string> {
    return new Set();
  }

  /** Creates the starter tree: roots first, then their children; existing roots are reused, not duplicated. */
  protected async seed(missing: StarterCategory[]): Promise<void> {
    this.seeding.set(true);
    const t = this.ctx.tenantId();
    const roots = new Map(this.nodes().filter((n) => n.depth === 0).map((n) => [n.category.name.toLowerCase(), n.category.id]));
    let created = 0;
    try {
      for (const c of missing) {
        let parentId = roots.get(c.name.toLowerCase());
        const parentSlug = slugify(c.name);
        if (!parentId) {
          parentId = (await firstValueFrom(this.api.createCategory(t, starterInput(c.name, null)))).id;
          created++;
        }
        for (const child of c.children ?? []) {
          // "Męskie › Spodnie" gets /kategoria/meskie-spodnie instead of spodnie-2; if taken, the server picks one.
          try {
            await firstValueFrom(this.api.createCategory(t, { ...starterInput(child, parentId), slug: slugify(parentSlug + ' ' + child) }));
          } catch (e) {
            if (ApiError.from(e).status !== 409) throw e;
            await firstValueFrom(this.api.createCategory(t, starterInput(child, parentId)));
          }
          created++;
        }
      }
      this.toast.success(`Dodano ${plural(created, 'kategorię', 'kategorie', 'kategorii')}.`);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.seeding.set(false);
      this.categories.reload();
    }
  }

  /** A category cannot be moved under itself or one of its descendants. */
  protected readonly parentOptions = computed<SelectOption[]>(() => {
    const editing = this.form()?.id;
    const blocked = new Set<string>();
    if (editing) {
      blocked.add(editing);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of this.categories.value() ?? []) {
          if (c.parentId && blocked.has(c.parentId) && !blocked.has(c.id)) { blocked.add(c.id); changed = true; }
        }
      }
    }
    return [{ value: '', label: 'Brak (kategoria główna)' },
      ...this.nodes().filter((n) => !blocked.has(n.category.id) && n.depth < 4).map((n) => ({ value: n.category.id, label: n.path.join(' › ') }))];
  });

  protected productsLabel(n: number): string {
    return n === 1 ? '1 produkt' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} produkty` : `${n} produktów`;
  }

  /** Our own constant SVG (no user input) — safe to render as HTML. */
  protected artPreview(m: ArtMotif, bg: ArtBackground): SafeHtml {
    const key = m.id + ':' + bg.id;
    let html = this.previews.get(key);
    if (!html) {
      html = this.sanitizer.bypassSecurityTrustHtml(artSvg(m, bg).replace('width="400" height="500"', 'width="100%" style="display:block"'));
      this.previews.set(key, html);
    }
    return html;
  }

  protected suggest(name: string): ArtMotif {
    return suggestMotif(name);
  }

  protected suggestBg(name: string): ArtBackground {
    return suggestBackground(name);
  }

  protected toggleArt(name: string): void {
    if (!this.artOpen()) {
      const m = suggestMotif(name);
      this.artMotif.set(m);
      this.artBg.set(suggestBackground(name));
    }
    this.artOpen.update((v) => !v);
  }

  protected async useArt(id: string): Promise<void> {
    try {
      const file = await renderArtPng(this.artMotif(), this.artBg(), `kategoria-${this.artMotif().id}.png`);
      await this.uploadImage(id, file);
      this.artOpen.set(false);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Nie udało się dodać grafiki.');
    }
  }

  protected async bulkArt(): Promise<void> {
    const list = this.withoutImage();
    this.bulkBusy.set(true);
    this.bulkDone.set(0);
    this.bulkTotal.set(list.length);
    let failed = 0;
    for (const c of list) {
      try {
        const m = suggestMotif(c.name);
        const file = await renderArtPng(m, suggestBackground(c.name), `kategoria-${m.id}.png`);
        await firstValueFrom(this.api.setCategoryImage(this.ctx.tenantId(), c.id, file));
        this.bulkDone.update((n) => n + 1);
      } catch {
        failed++;
      }
    }
    this.bulkBusy.set(false);
    this.bulkOpen.set(false);
    this.categories.reload();
    if (failed) this.toast.error(`Dodano ${this.bulkDone()} grafik, ${failed} nie udało się dodać — spróbuj ponownie.`);
    else this.toast.success(`Dodano grafiki do ${this.bulkDone()} kategorii.`);
  }

  protected open(c: Category | null, parentId: string | null): void {
    this.error.set(null);
    this.artOpen.set(false);
    this.formImage.set(c?.image?.['w400'] ?? null);
    this.form.set(c
      ? { id: c.id, name: c.name, slug: c.slug, description: c.description ?? '', parentId: c.parentId ?? '', visible: c.visible,
          seoTitle: c.seoTitle ?? '', seoDescription: c.seoDescription ?? '', version: c.version }
      : { id: null, name: '', slug: '', description: '', parentId: parentId ?? '', visible: true, seoTitle: '', seoDescription: '', version: 0 });
  }

  protected close(): void {
    if (!this.saving()) this.form.set(null);
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f) return;
    if (!f.name.trim()) {
      this.error.set('Podaj nazwę kategorii.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const input = { name: f.name.trim(), slug: f.slug.trim() || null, description: f.description.trim() || null,
      parentId: f.parentId || null, position: null, visible: f.visible, seoTitle: f.seoTitle.trim() || null,
      seoDescription: f.seoDescription.trim() || null, version: f.version };
    try {
      await firstValueFrom(f.id ? this.api.updateCategory(this.ctx.tenantId(), f.id, input) : this.api.createCategory(this.ctx.tenantId(), input));
      this.toast.success('Zapisano kategorię.');
      this.form.set(null);
      this.categories.reload();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected pickImage(e: Event, id: string): void {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (file) void this.uploadImage(id, file);
  }

  protected dropImage(e: DragEvent, id: string): void {
    e.preventDefault();
    this.imageOver.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.uploadImage(id, file);
  }

  private async uploadImage(id: string, file: File): Promise<void> {
    if (!['image/jpeg', 'image/png'].includes(file.type)) { this.toast.error('Dozwolone są pliki JPEG i PNG.'); return; }
    if (file.size > 10 * 1024 * 1024) { this.toast.error('Plik jest większy niż 10 MB.'); return; }
    this.imageBusy.set(true);
    try {
      const c = await firstValueFrom(this.api.setCategoryImage(this.ctx.tenantId(), id, file));
      this.formImage.set(c.image?.['w400'] ?? null);
      this.categories.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.imageBusy.set(false);
    }
  }

  protected async removeImage(id: string): Promise<void> {
    this.imageBusy.set(true);
    try {
      await firstValueFrom(this.api.removeCategoryImage(this.ctx.tenantId(), id));
      this.formImage.set(null);
      this.categories.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.imageBusy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const c = this.toDelete();
    if (!c) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.deleteCategory(this.ctx.tenantId(), c.id));
      this.toast.success('Usunięto kategorię.');
      this.categories.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
      this.toDelete.set(null);
    }
  }

  protected async addBrand(): Promise<void> {
    try {
      await firstValueFrom(this.api.createBrand(this.ctx.tenantId(), this.brandName.trim()));
      this.brandName = '';
      this.brands.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected async deleteBrand(b: Brand): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteBrand(this.ctx.tenantId(), b.id));
      this.toast.success(`Usunięto markę ${b.name}.`);
      this.brands.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}

function starterInput(name: string, parentId: string | null) {
  return { name, slug: null as string | null, description: null, parentId, position: null, visible: true, seoTitle: null, seoDescription: null, version: 0 };
}
