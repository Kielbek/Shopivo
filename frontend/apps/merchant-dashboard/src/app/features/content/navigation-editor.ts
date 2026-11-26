import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi, ContentApi } from '@shopivo/api-client';
import { NavigationItem } from '@shopivo/shared-models';
import {
  AlertComponent, ButtonComponent, CardComponent, FieldComponent, LoadingComponent, SelectComponent, SelectOption, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const MAX_ITEMS = 12;

/** Header menu of the storefront: up to 12 links to places in the store (never external). */
@Component({
  selector: 'sv-navigation-editor',
  imports: [FormsModule, LucideDynamicIcon, CardComponent, ButtonComponent, AlertComponent, LoadingComponent, FieldComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-card class="mt-5" heading="Menu w nagłówku sklepu"
      subheading="Bez własnego menu sklep pokazuje główne kategorie. Linki mogą prowadzić tylko do stron w Twoim sklepie.">
      @if (menu.isLoading() && !menu.value()) {
        <sv-loading />
      } @else if (menu.error()) {
        <sv-alert tone="error">Nie udało się wczytać menu.</sv-alert>
      } @else {
        @if (!items().length) {
          <p class="text-[13px] text-ink-muted">{{ menu.value()?.custom ? 'Menu jest puste — sklep pokaże główne kategorie.' : 'Teraz sklep pokazuje główne kategorie.' }}</p>
        }
        <ol class="space-y-2">
          @for (it of items(); track $index; let i = $index; let last = $last) {
            <li class="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2">
              <label class="sr-only" [for]="'nav-label-' + i">Nazwa pozycji {{ i + 1 }}</label>
              <input [id]="'nav-label-' + i" class="sv-input !h-9 max-w-[220px]" maxlength="40" [disabled]="!canWrite"
                [ngModel]="it.label" (ngModelChange)="rename(i, $event)" />
              <code class="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{{ it.path }}</code>
              @if (canWrite) {
                <button sv-button variant="ghost" size="icon" [disabled]="i === 0" [attr.aria-label]="'Przesuń wyżej: ' + it.label" (click)="move(i, -1)"><svg [lucideIcon]="icons.moveUp" /></button>
                <button sv-button variant="ghost" size="icon" [disabled]="last" [attr.aria-label]="'Przesuń niżej: ' + it.label" (click)="move(i, 1)"><svg [lucideIcon]="icons.chevronDown" /></button>
                <button sv-button variant="ghost" size="icon" [attr.aria-label]="'Usuń: ' + it.label" (click)="remove(i)"><svg [lucideIcon]="icons.trash" /></button>
              }
            </li>
          }
        </ol>
        @if (canWrite) {
          @if (items().length < max) {
            <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <sv-field label="Dodaj pozycję" for="nav-add">
                <sv-select inputId="nav-add" ariaLabel="Dodaj pozycję menu" [options]="sources()" [(value)]="choice" placeholder="Wybierz kategorię, stronę lub inny adres…" />
              </sv-field>
              <button sv-button variant="secondary" [disabled]="!choice()" (click)="add()"><svg [lucideIcon]="icons.plus" />Dodaj</button>
            </div>
            @if (choice() === 'custom') {
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <sv-field label="Nazwa" for="nav-c-label"><input id="nav-c-label" class="sv-input" maxlength="40" [(ngModel)]="customLabel" /></sv-field>
                <sv-field label="Adres w sklepie" for="nav-c-path" hint="np. /produkt/kubek albo /szukaj?q=prezent"><input id="nav-c-path" class="sv-input" maxlength="300" placeholder="/" [(ngModel)]="customPath" /></sv-field>
              </div>
            }
          }
          @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e }}</sv-alert>}
          <div class="mt-5 flex flex-wrap gap-2">
            <button sv-button [loading]="saving()" (click)="save(items())">Zapisz menu</button>
            @if (menu.value()?.custom) {<button sv-button variant="ghost" [disabled]="saving()" (click)="save([])">Przywróć domyślne (kategorie)</button>}
          </div>
        }
      }
    </sv-card>
  `,
})
export class NavigationEditorComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('CONTENT_WRITE');
  protected readonly max = MAX_ITEMS;

  protected readonly menu = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.navigation(params) });
  private readonly categories = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.catalog.categories(params) });
  private readonly pages = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.list(params, 'PAGE', '', 0) });

  protected readonly items = signal<NavigationItem[]>([]);
  protected readonly choice = signal<string | null>(null);
  protected customLabel = '';
  protected customPath = '';
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Places in the store that can be linked, keyed for the select. */
  private readonly targets = computed(() => {
    const map = new Map<string, { item: NavigationItem; label: string; description?: string }>();
    map.set('all', { item: { label: 'Wszystkie produkty', path: '/produkty' }, label: 'Wszystkie produkty' });
    for (const c of this.categories.hasValue() ? this.categories.value() : []) {
      if (c.visible) map.set('cat:' + c.id, { item: { label: c.name, path: '/kategoria/' + c.slug }, label: '— '.repeat(c.depth) + c.name, description: 'Kategoria' });
    }
    for (const p of this.pages.hasValue() ? this.pages.value().items : []) {
      if (p.status === 'PUBLISHED') map.set('page:' + p.id, { item: { label: p.title, path: p.path }, label: p.title, description: 'Strona' });
    }
    map.set('blog', { item: { label: 'Blog', path: '/blog' }, label: 'Blog', description: 'Lista wpisów' });
    return map;
  });
  protected readonly sources = computed<SelectOption[]>(() => [
    ...[...this.targets()].map(([value, t]) => ({ value, label: t.label, description: t.description })),
    { value: 'custom', label: 'Inny adres w sklepie…' },
  ]);

  constructor() {
    effect(() => {
      const m = this.menu.hasValue() ? this.menu.value() : null;
      if (m) this.items.set(m.items.map((i) => ({ ...i })));
    });
  }

  protected add(): void {
    const c = this.choice();
    if (!c) return;
    let item: NavigationItem;
    if (c === 'custom') {
      if (!this.customLabel.trim() || !this.customPath.trim()) {
        this.error.set('Podaj nazwę i adres pozycji.');
        return;
      }
      item = { label: this.customLabel.trim(), path: this.customPath.trim() };
      this.customLabel = '';
      this.customPath = '';
    } else {
      const t = this.targets().get(c);
      if (!t) return;
      item = { label: t.item.label.slice(0, 40), path: t.item.path };
    }
    this.error.set(null);
    this.items.update((l) => [...l, item]);
    this.choice.set(null);
  }

  protected rename(i: number, label: string): void {
    this.items.update((l) => l.map((it, j) => (j === i ? { ...it, label } : it)));
  }

  protected move(i: number, delta: number): void {
    this.items.update((l) => {
      const copy = [...l];
      const [it] = copy.splice(i, 1);
      copy.splice(i + delta, 0, it);
      return copy;
    });
  }

  protected remove(i: number): void {
    this.items.update((l) => l.filter((_, j) => j !== i));
  }

  protected async save(items: NavigationItem[]): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.saveNavigation(this.ctx.tenantId(), items, this.menu.value()?.version ?? -1));
      this.toast.success(items.length ? 'Zapisano menu sklepu.' : 'Przywrócono domyślne menu.');
      this.menu.reload();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
