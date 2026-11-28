import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TemplateSetting } from '@shopivo/shared-models';
import { valueOf } from './template-doc';

export interface LinkOption { value: string; label: string; }
export interface CategoryOption { slug: string; label: string; }

const SOURCES: { value: string; label: string }[] = [
  { value: 'bestsellers', label: 'Bestsellery (najczęściej kupowane)' }, { value: 'newest', label: 'Nowości' },
  { value: 'sale', label: 'Promocje (największe obniżki)' }, { value: 'top_rated', label: 'Najlepiej oceniane' },
  { value: 'last_pieces', label: 'Ostatnie sztuki' }, { value: 'back_in_stock', label: 'Wróciły do sprzedaży' },
  { value: 'category', label: 'Wybrana kategoria' },
];

/**
 * The form of one section or element, built from the template's schema: one control per setting type. Every change is
 * reported at once (the page updates the preview and saves the draft).
 */
@Component({
  selector: 'sv-setting-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      @for (s of settings(); track s.id) {
        @let v = value(s);
        @let fid = idPrefix() + '-' + s.id;
        <div>
          @switch (s.type) {
            @case ('checkbox') {
              <label class="flex items-center gap-2.5 text-[13px] font-medium text-ink"><input type="checkbox" class="size-4" [checked]="!!v" (change)="emit(s, $any($event.target).checked)" />{{ s.label }}</label>
            }
            @default {
              <label class="mb-1.5 block text-[12px] font-semibold text-ink-soft" [for]="fid">{{ s.label }}</label>
              @switch (s.type) {
                @case ('text') {
                  <input [id]="fid" class="sv-input" [value]="v ?? ''" [attr.maxlength]="s.max ?? 300" (input)="emit(s, $any($event.target).value)" />
                }
                @case ('textarea') {
                  <textarea [id]="fid" class="sv-input min-h-20 py-2" [value]="v ?? ''" [attr.maxlength]="s.max ?? 2000" (input)="emit(s, $any($event.target).value)"></textarea>
                }
                @case ('url') {
                  <input [id]="fid" class="sv-input" [value]="v ?? ''" placeholder="/produkty albo https://…" [attr.list]="fid + '-list'" (change)="emit(s, $any($event.target).value.trim())" />
                  <datalist [id]="fid + '-list'">@for (o of links(); track o.value) {<option [value]="o.value">{{ o.label }}</option>}</datalist>
                }
                @case ('image') {
                  <div class="flex items-center gap-3">
                    <button type="button" class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-line bg-canvas" [attr.aria-label]="'Zmień: ' + s.label" (click)="pickImage.emit(s.id)">
                      @if (imageUrl()(v); as url) {<img [src]="url" alt="" class="size-full object-cover" />} @else {<span class="text-[11px] text-ink-muted">Brak</span>}
                    </button>
                    <div class="flex flex-col items-start gap-1 text-[12px]">
                      <button type="button" class="font-semibold text-primary-strong hover:underline" (click)="pickImage.emit(s.id)">Zmień zdjęcie</button>
                      @if (v !== s.defaultValue && s.defaultValue) {<button type="button" class="text-ink-soft hover:underline" (click)="emit(s, s.defaultValue)">Przywróć zdjęcie szablonu</button>}
                      @if (v) {<button type="button" class="text-ink-soft hover:underline" (click)="emit(s, '')">Bez zdjęcia</button>}
                    </div>
                  </div>
                }
                @case ('select') {
                  <select [id]="fid" class="sv-input" (change)="emit(s, $any($event.target).value)">
                    @for (o of s.options ?? []; track o.value) {<option [value]="o.value" [selected]="o.value === v">{{ o.label }}</option>}
                  </select>
                }
                @case ('number') {
                  <input [id]="fid" type="number" class="sv-input w-28" [value]="v" [attr.min]="s.min" [attr.max]="s.max"
                    (change)="emitNumber(s, $any($event.target).value)" />
                }
                @case ('color') {
                  <div class="flex items-center gap-2"><input [id]="fid" type="color" class="h-9 w-12 rounded-[8px] border border-line" [value]="v || '#000000'" (input)="emit(s, $any($event.target).value)" />
                    <span class="font-mono text-[12px] text-ink-soft">{{ v }}</span></div>
                }
                @case ('product_list') {
                  @let p = $any(v) ?? {};
                  <div class="space-y-2 rounded-[10px] border border-line p-3">
                    <select [id]="fid" class="sv-input" aria-label="Skąd produkty" (change)="emit(s, { source: $any($event.target).value, count: p.count ?? 6, category: p.category })">
                      @for (o of sources; track o.value) {<option [value]="o.value" [selected]="o.value === p.source">{{ o.label }}</option>}
                    </select>
                    <select class="sv-input" [attr.aria-label]="p.source === 'category' ? 'Kategoria' : 'Tylko z kategorii (opcjonalnie)'"
                      (change)="emit(s, withCategory(p, $any($event.target).value))">
                      @if (p.source !== 'category') {<option value="" [selected]="!p.category">Ze wszystkich kategorii</option>}
                      @else if (!p.category) {<option value="" selected disabled>Wybierz kategorię…</option>}
                      @for (c of categories(); track c.slug) {<option [value]="c.slug" [selected]="c.slug === p.category">{{ c.label }}</option>}
                    </select>
                    <label class="flex items-center gap-2 text-[12px] text-ink-soft">Ile produktów
                      <input type="number" min="1" max="24" class="sv-input w-20" [value]="p.count ?? 6" (change)="emit(s, { ...p, count: clamp($any($event.target).value, 1, 24) })" /></label>
                  </div>
                }
                @case ('category_list') {
                  @let c = $any(v) ?? { mode: 'top' };
                  <div class="space-y-2 rounded-[10px] border border-line p-3 text-[13px]">
                    <label class="flex items-center gap-2"><input type="radio" [name]="fid" [checked]="c.mode !== 'selected'" (change)="emit(s, { mode: 'top' })" />Kategorie główne sklepu</label>
                    <label class="flex items-center gap-2"><input type="radio" [name]="fid" [checked]="c.mode === 'selected'" (change)="emit(s, { mode: 'selected', slugs: [] })" />Wybrane kategorie</label>
                    @if (c.mode === 'selected') {
                      <ul class="max-h-48 space-y-1 overflow-y-auto pl-6">
                        @for (cat of categories(); track cat.slug) {
                          <li><label class="flex items-center gap-2"><input type="checkbox" [checked]="(c.slugs ?? []).includes(cat.slug)" (change)="emit(s, toggleSlug(c, cat.slug))" />{{ cat.label }}</label></li>
                        }
                      </ul>
                    }
                  </div>
                }
                @case ('link_list') {
                  @let list = $any(v) ?? [];
                  <ul class="space-y-2">
                    @for (l of list; track $index; let i = $index) {
                      <li class="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                        <input class="sv-input" [value]="l.label" aria-label="Nazwa linku" maxlength="60" (change)="emit(s, patchLink(list, i, { label: $any($event.target).value }))" />
                        <input class="sv-input" [value]="l.url" aria-label="Adres linku" [attr.list]="fid + '-list'" (change)="emit(s, patchLink(list, i, { url: $any($event.target).value.trim() }))" />
                        <button type="button" class="rounded-[8px] px-2 text-ink-muted hover:bg-hover hover:text-danger-ink" [attr.aria-label]="'Usuń link ' + l.label" (click)="emit(s, removeLink(list, i))">✕</button>
                      </li>
                    }
                  </ul>
                  <datalist [id]="fid + '-list'">@for (o of links(); track o.value) {<option [value]="o.value">{{ o.label }}</option>}</datalist>
                  @if (list.length < (s.max ?? 12)) {<button type="button" class="mt-2 text-[12px] font-semibold text-primary-strong hover:underline" (click)="emit(s, addLink(list))">+ Dodaj link</button>}
                }
              }
            }
          }
          @if (s.info) {<p class="mt-1 text-[11px] text-ink-muted">{{ s.info }}</p>}
        </div>
      }
    </div>
  `,
})
export class SettingFieldsComponent {
  readonly settings = input.required<TemplateSetting[]>();
  readonly values = input<Record<string, unknown>>({});
  readonly idPrefix = input('f');
  readonly links = input<LinkOption[]>([]);
  readonly categories = input<CategoryOption[]>([]);
  readonly imageUrl = input<(ref: unknown) => string | null>(() => null);
  readonly changed = output<{ id: string; value: unknown }>();
  readonly pickImage = output<string>();
  protected readonly sources = SOURCES;

  protected value(s: TemplateSetting): unknown {
    return valueOf(this.values(), s.id, s.defaultValue ?? null);
  }

  protected emit(s: TemplateSetting, value: unknown): void {
    this.changed.emit({ id: s.id, value });
  }

  protected clamp(v: string, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(Number(v) || min)));
  }

  protected emitNumber(s: TemplateSetting, v: string): void {
    this.emit(s, this.clamp(v, s.min ?? 0, s.max ?? 1_000_000));
  }

  protected withCategory(p: { source?: string; count?: number }, slug: string): unknown {
    const out: Record<string, unknown> = { source: p.source ?? 'newest', count: p.count ?? 6 };
    if (slug) out['category'] = slug;
    return out;
  }

  protected toggleSlug(c: { slugs?: string[] }, slug: string): unknown {
    const slugs = c.slugs ?? [];
    return { mode: 'selected', slugs: slugs.includes(slug) ? slugs.filter((x) => x !== slug) : [...slugs, slug] };
  }

  protected patchLink(list: { label: string; url: string }[], i: number, change: Partial<{ label: string; url: string }>): unknown {
    return list.map((l, j) => (j === i ? { ...l, ...change } : l));
  }

  protected removeLink(list: unknown[], i: number): unknown {
    return list.filter((_, j) => j !== i);
  }

  protected addLink(list: unknown[]): unknown {
    return [...list, { label: 'Nowy link', url: '/produkty' }];
  }
}
