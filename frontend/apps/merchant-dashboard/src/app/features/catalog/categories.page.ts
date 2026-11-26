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
import { StoreContext } from '../store/store-context';
import { buildTree } from './category-tree';
import { SeoPanelComponent } from './seo-panel';
import { StarterCategory, industryOf } from './industries';

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
    } @else if (canWrite && !ctx.store()?.industry && !tree().length) {
      <sv-alert class="mt-6">Wybierz branżę sklepu w <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'ustawienia']">Ustawieniach</a>, a zaproponujemy gotowe kategorie.</sv-alert>
    }

    <div class="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <sv-card heading="Kategorie" [flush]="true">
        @if (categories.isLoading() && !categories.value()) {
          <sv-loading />
        } @else if (categories.error()) {
          <div class="px-5 pb-5"><sv-alert tone="error">Nie udało się wczytać kategorii.</sv-alert></div>
        } @else if (!tree().length) {
          <sv-empty-state icon="categories" title="Brak kategorii" description="Np. Odzież → Koszulki, Bluzy.">
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
                <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px]" [class]="n.depth === 0 ? 'bg-primary-soft text-primary' : 'bg-canvas text-ink-muted'">
                  <svg [lucideIcon]="n.childCount ? icons.categories : icons.tag" [size]="15" />
                </span>
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
          <p class="px-5 pb-5 text-[13px] text-ink-muted">Brak marek.</p>
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

    <sv-dialog [heading]="form()?.id ? 'Edytuj kategorię' : 'Nowa kategoria'" [open]="!!form()" (closed)="close()">
      @if (form(); as f) {
        <form id="category-form" class="space-y-4" (ngSubmit)="save()">
          @if (error(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
          <sv-field label="Nazwa" for="c-name"><input id="c-name" name="name" class="sv-input" maxlength="120" required [(ngModel)]="f.name" /></sv-field>
          <sv-field label="Kategoria nadrzędna" for="c-parent" info="Podkategoria wyświetla się w sklepie pod wybraną kategorią, np. Odzież › Damskie › Sukienki. Wybierz „Brak”, aby utworzyć kategorię główną.">
            <sv-select inputId="c-parent" name="parent" [options]="parentOptions()" [(ngModel)]="f.parentId" ariaLabel="Kategoria nadrzędna" />
          </sv-field>
          <sv-field label="Opis" for="c-desc" [optional]="true"><textarea id="c-desc" name="desc" class="sv-input min-h-20 py-2.5" maxlength="2000" [(ngModel)]="f.description"></textarea></sv-field>
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

  protected readonly plural = plural;
  protected readonly nodes = computed(() => buildTree(this.categories.value() ?? []));
  protected readonly tree = computed(() => this.nodes().map((n) => n.category));
  protected readonly collapsed = signal(new Set<string>());
  protected readonly seeding = signal(false);
  protected readonly visibleTree = computed(() => {
    const hidden = this.collapsed();
    return this.nodes().filter((n) => !n.ancestors.some((a) => hidden.has(a)));
  });
  protected readonly roots = computed(() => this.nodes().filter((n) => n.depth === 0).length);

  /** Starter categories for the store's industry that do not exist yet (matched by name under the same parent). */
  protected readonly starter = computed(() => {
    const industry = industryOf(this.ctx.store()?.industry);
    if (!industry || !this.categories.hasValue()) return null;
    const existing = this.nodes();
    const rootByName = new Map(existing.filter((n) => n.depth === 0).map((n) => [n.category.name.toLowerCase(), n.category.id]));
    const missing: StarterCategory[] = [];
    let count = 0;
    for (const c of industry.categories) {
      const rootId = rootByName.get(c.name.toLowerCase());
      const childNames = new Set(existing.filter((n) => rootId && n.category.parentId === rootId).map((n) => n.category.name.toLowerCase()));
      const children = (c.children ?? []).filter((ch) => !childNames.has(ch.toLowerCase()));
      if (!rootId || children.length) {
        missing.push({ name: c.name, children });
        count += (rootId ? 0 : 1) + children.length;
      }
    }
    const preview = industry.categories.map((c) => (c.children?.length ? `${c.name} (${c.children.join(', ')})` : c.name)).join(' · ');
    return { label: industry.label, missing, count, preview };
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

  protected open(c: Category | null, parentId: string | null): void {
    this.error.set(null);
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
