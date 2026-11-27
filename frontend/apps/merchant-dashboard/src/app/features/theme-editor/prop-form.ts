import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { Category, SectionProp } from '@shopivo/shared-models';
import { SelectComponent, SelectOption, icons } from '@shopivo/shared-ui';
import { CategoryTreeSelectComponent, buildTree } from '../catalog/category-tree';
import { optionLabel } from './labels';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

/**
 * Generic form for a section's properties (texts, choices, links, images, categories, repeatable items). Every change
 * emits the whole new data object — the editor keeps it, previews it live and saves it.
 */
@Component({
  selector: 'sv-prop-form',
  imports: [LucideDynamicIcon, SelectComponent, CategoryTreeSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      @for (p of visibleProps(); track p.key) {
        @let id = idPrefix() + '-' + p.key;
        <div>
          <label class="sv-label" [attr.for]="id">{{ p.label }}</label>
          <div class="mt-1.5">
            @switch (p.kind) {
              @case ('TEXT') {
                <input class="sv-input" [id]="id" [attr.maxlength]="p.max" [value]="data()[p.key] ?? ''" (input)="set(p.key, $any($event.target).value)" />
              }
              @case ('TEXTAREA') {
                <textarea class="sv-input min-h-24 py-2" [id]="id" [attr.maxlength]="p.max" [value]="data()[p.key] ?? ''" (input)="set(p.key, $any($event.target).value)"></textarea>
              }
              @case ('SELECT') {
                <sv-select [inputId]="id" [ariaLabel]="p.label" [options]="optionsOf(p)" [value]="data()[p.key]" (valueChange)="set(p.key, $event)" />
              }
              @case ('LINK') {
                <sv-select [inputId]="id" [ariaLabel]="p.label" [options]="linkChoices(data()[p.key])" [value]="linkValue(data()[p.key])"
                  (valueChange)="setLink(p.key, $event)" />
                @if (linkValue(data()[p.key]) === '__custom') {
                  <input class="sv-input mt-2" maxlength="300" placeholder="/strona/o-nas albo https://…" aria-label="Własny adres"
                    [value]="data()[p.key] ?? ''" (change)="set(p.key, $any($event.target).value.trim())" />
                }
              }
              @case ('IMAGE') {
                @let url = imageUrl()(data()[p.key]);
                <div class="flex items-center gap-3">
                  <span class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-line bg-canvas text-ink-muted">
                    @if (url) {<img [src]="url" alt="" class="size-full object-cover" />} @else {<svg [lucideIcon]="icons.image" [size]="20" />}
                  </span>
                  <div class="flex flex-col items-start gap-1">
                    <button type="button" class="text-[13px] font-medium text-primary-strong hover:underline" [id]="id"
                      [attr.aria-label]="(url ? 'Zmień zdjęcie' : 'Wybierz zdjęcie') + ' (' + p.label + ')'" (click)="pickImage.emit(p.key)">{{ url ? 'Zmień zdjęcie' : 'Wybierz zdjęcie' }}</button>
                    @if (url) {<button type="button" class="text-[12px] text-ink-muted hover:text-danger-ink" (click)="set(p.key, '')">Usuń</button>}
                  </div>
                </div>
              }
              @case ('CATEGORY') {
                <sv-select [inputId]="id" [ariaLabel]="p.label" [options]="categoryOptions()" [value]="data()[p.key] ?? ''" (valueChange)="set(p.key, $event ?? '')" />
              }
              @case ('CATEGORIES') {
                <div class="rounded-[10px] border border-line pt-3">
                  <sv-category-tree-select [categories]="categories()" [value]="data()[p.key] ?? []" (valueChange)="set(p.key, $event)" />
                </div>
              }
              @case ('ITEMS') {
                <ol class="space-y-3">
                  @for (item of data()[p.key] ?? []; track $index; let i = $index; let last = $last; let first = $first) {
                    <li class="rounded-[10px] border border-line p-3">
                      <div class="mb-2 flex items-center gap-1">
                        <span class="text-[12px] font-medium text-ink-muted">{{ i + 1 }}.</span>
                        <span class="flex-1"></span>
                        <button type="button" class="rounded p-1 text-ink-muted hover:bg-hover disabled:opacity-30" [disabled]="first" aria-label="Przesuń wyżej" (click)="moveItem(p.key, i, -1)"><svg [lucideIcon]="icons.chevronUp" [size]="14" /></button>
                        <button type="button" class="rounded p-1 text-ink-muted hover:bg-hover disabled:opacity-30" [disabled]="last" aria-label="Przesuń niżej" (click)="moveItem(p.key, i, 1)"><svg [lucideIcon]="icons.chevronDown" [size]="14" /></button>
                        <button type="button" class="rounded p-1 text-ink-muted hover:bg-hover hover:text-danger-ink" aria-label="Usuń element" (click)="removeItem(p.key, i)"><svg [lucideIcon]="icons.trash" [size]="14" /></button>
                      </div>
                      <div class="space-y-2">
                        @for (ip of p.itemProps ?? []; track ip.key) {
                          @let iid = id + '-' + i + '-' + ip.key;
                          <div>
                            <label class="text-[12px] text-ink-soft" [attr.for]="iid">{{ ip.label }}</label>
                            @if (ip.kind === 'SELECT') {
                              <sv-select class="mt-1 block" [inputId]="iid" [ariaLabel]="ip.label" [options]="optionsOf(ip)" [value]="item[ip.key]" (valueChange)="setItem(p.key, i, ip.key, $event)" />
                            } @else if (ip.kind === 'TEXTAREA') {
                              <textarea class="sv-input mt-1 min-h-20 py-2" [id]="iid" [attr.maxlength]="ip.max" [value]="item[ip.key] ?? ''" (input)="setItem(p.key, i, ip.key, $any($event.target).value)"></textarea>
                            } @else {
                              <input class="sv-input mt-1" [id]="iid" [attr.maxlength]="ip.max" [value]="item[ip.key] ?? ''" (input)="setItem(p.key, i, ip.key, $any($event.target).value)" />
                            }
                          </div>
                        }
                      </div>
                    </li>
                  }
                </ol>
                @if ((data()[p.key]?.length ?? 0) < p.max) {
                  <button type="button" class="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary-strong hover:underline" (click)="addItem(p)">
                    <svg [lucideIcon]="icons.plus" [size]="14" />Dodaj</button>
                }
              }
            }
          </div>
          @if (p.help) {<p class="mt-1 text-[12px] text-ink-muted">{{ p.help }}</p>}
        </div>
      }
    </div>
  `,
})
export class PropFormComponent {
  protected readonly icons = icons;
  readonly props = input.required<SectionProp[]>();
  readonly data = input.required<Data>();
  readonly categories = input<Category[]>([]);
  readonly links = input<SelectOption[]>([]);
  readonly imageUrl = input<(id: string | null | undefined) => string | null>(() => null);
  readonly idPrefix = input('p');
  readonly changed = output<Data>();
  readonly pickImage = output<string>();

  /** "Wybrana kategoria" field only matters when that source is chosen. */
  protected readonly visibleProps = computed(() => this.props().filter((p) => !(p.kind === 'CATEGORY' && 'source' in this.data() && this.data()['source'] !== 'category')));
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Wybierz kategorię…' }, ...buildTree(this.categories()).map((n) => ({ value: n.category.id, label: n.path.join(' › ') })),
  ]);

  protected optionsOf(p: SectionProp): SelectOption[] {
    return (p.options ?? []).map((o) => ({ value: o, label: optionLabel(p.key, o) }));
  }

  protected linkChoices(current: string | undefined): SelectOption[] {
    const opts = [{ value: '', label: 'Brak przycisku' }, ...this.links(), { value: '__custom', label: 'Inny adres…' }];
    return opts;
  }

  protected linkValue(v: string | undefined): string {
    if (!v) return '';
    return this.links().some((l) => l.value === v) ? v : '__custom';
  }

  protected setLink(key: string, v: string | null): void {
    if (v === '__custom') this.set(key, this.data()[key] && !this.links().some((l) => l.value === this.data()[key]) ? this.data()[key] : '/');
    else this.set(key, v ?? '');
  }

  protected set(key: string, value: unknown): void {
    this.changed.emit({ ...this.data(), [key]: value });
  }

  protected setItem(key: string, index: number, prop: string, value: unknown): void {
    const items = [...(this.data()[key] ?? [])];
    items[index] = { ...items[index], [prop]: value };
    this.set(key, items);
  }

  protected addItem(p: SectionProp): void {
    const blank = Object.fromEntries((p.itemProps ?? []).map((ip) => [ip.key, ip.kind === 'SELECT' ? ip.options?.[0] ?? '' : '']));
    this.set(p.key, [...(this.data()[p.key] ?? []), blank]);
  }

  protected removeItem(key: string, index: number): void {
    this.set(key, (this.data()[key] ?? []).filter((_: unknown, i: number) => i !== index));
  }

  protected moveItem(key: string, index: number, delta: number): void {
    const items = [...(this.data()[key] ?? [])];
    const [it] = items.splice(index, 1);
    items.splice(index + delta, 0, it);
    this.set(key, items);
  }
}
