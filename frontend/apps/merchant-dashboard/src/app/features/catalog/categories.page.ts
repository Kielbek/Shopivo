import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi } from '@shopivo/api-client';
import { Brand, Category } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent, FieldComponent,
  LoadingComponent, PageHeaderComponent, SelectComponent, SelectOption, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface CategoryForm {
  id: string | null; name: string; slug: string; description: string; parentId: string; visible: boolean;
  seoTitle: string; seoDescription: string; version: number;
}

@Component({
  selector: 'sv-categories-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, EmptyStateComponent, DialogComponent, FieldComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Kategorie i marki" description="Drzewo kategorii (do 5 poziomów) porządkuje katalog i nawigację sklepu.">
      @if (canWrite) {<button sv-button (click)="open(null, null)"><svg [lucideIcon]="icons.folderPlus" />Nowa kategoria</button>}
    </sv-page-header>

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
          <ul class="px-3 pb-3" role="tree" aria-label="Drzewo kategorii">
            @for (c of tree(); track c.id) {
              <li role="treeitem" [attr.aria-level]="c.depth + 1"
                class="group flex items-center gap-3 rounded-[10px] py-2 pr-2 hover:bg-hover" [style.padding-left.px]="12 + c.depth * 24">
                <svg [lucideIcon]="icons.categories" [size]="16" class="shrink-0 text-ink-muted" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] font-medium text-ink">{{ c.name }}
                    @if (!c.visible) {<sv-badge class="ml-1.5">Ukryta</sv-badge>}</p>
                  <p class="truncate text-[12px] text-ink-muted">/{{ c.slug }} ·
                    <a class="hover:text-ink" [routerLink]="['/sklep', ctx.tenantId(), 'produkty']" [queryParams]="{ kategoria: c.id }">{{ productsLabel(c.productCount) }}</a></p>
                </div>
                @if (canWrite) {
                  <div class="flex shrink-0 gap-1">
                    @if (c.depth < 4) {
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
          <sv-field label="Kategoria nadrzędna" for="c-parent">
            <sv-select inputId="c-parent" name="parent" [options]="parentOptions()" [(ngModel)]="f.parentId" ariaLabel="Kategoria nadrzędna" />
          </sv-field>
          <sv-field label="Opis" for="c-desc" [optional]="true"><textarea id="c-desc" name="desc" class="sv-input min-h-20 py-2.5" maxlength="2000" [(ngModel)]="f.description"></textarea></sv-field>
          <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="visible" [(ngModel)]="f.visible" />Widoczna w sklepie</label>
          <details class="rounded-[var(--radius-control)] border border-line px-4 py-3 text-[13px]">
            <summary class="cursor-pointer font-medium text-ink">Adres i SEO</summary>
            <div class="mt-3 space-y-3">
              <sv-field label="Adres" for="c-slug" [optional]="true" hint="Tworzony z nazwy, jeśli pusty"><input id="c-slug" name="slug" class="sv-input" maxlength="120" [(ngModel)]="f.slug" /></sv-field>
              <sv-field label="Tytuł strony" for="c-seo-t" [optional]="true"><input id="c-seo-t" name="seoTitle" class="sv-input" maxlength="160" [(ngModel)]="f.seoTitle" /></sv-field>
              <sv-field label="Opis strony" for="c-seo-d" [optional]="true"><textarea id="c-seo-d" name="seoDesc" class="sv-input min-h-16 py-2.5" maxlength="320" [(ngModel)]="f.seoDescription"></textarea></sv-field>
            </div>
          </details>
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

  /** Depth-first order (the API returns breadth-first). */
  protected readonly tree = computed(() => {
    const all = this.categories.value() ?? [];
    const children = new Map<string | null, Category[]>();
    for (const c of all) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
    const out: Category[] = [];
    const walk = (parent: string | null) => {
      for (const c of (children.get(parent) ?? []).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pl'))) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(null);
    return out;
  });

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
      ...this.tree().filter((c) => !blocked.has(c.id) && c.depth < 4).map((c) => ({ value: c.id, label: ' '.repeat(c.depth) + c.name }))];
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
