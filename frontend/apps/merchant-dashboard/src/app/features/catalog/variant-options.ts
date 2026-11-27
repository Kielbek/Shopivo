import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { StoreIndustry } from '@shopivo/shared-models';
import { ButtonComponent, icons } from '@shopivo/shared-ui';
import { COLOR_SWATCHES, OPTION_PRESETS, OptionPreset, presetsFor } from './industries';

export interface OptionRow { name: string; values: string[]; }

export const MAX_OPTIONS = 3;
const MAX_VALUES = 50;
const COLOR_NAMES = ['kolor', 'barwa', 'kolor ramy', 'kolor obudowy'];

export function isColorOption(name: string): boolean {
  return COLOR_NAMES.includes(name.trim().toLowerCase());
}

/** Values typed or pasted as "S, M; L" become separate values (trimmed, duplicates ignored, case-insensitive). */
export function splitValues(text: string): string[] {
  return text.split(/[,;\n]/).map((v) => v.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

export function mergeValues(current: string[], added: string[]): string[] {
  const seen = new Set(current.map((v) => v.toLowerCase()));
  const out = [...current];
  for (const v of added) {
    if (!seen.has(v.toLowerCase()) && out.length < MAX_VALUES) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/**
 * Variant options editor: one-click presets matched to the store's industry (sizes, colours, capacities…), values as
 * removable chips with an input that accepts Enter, comma or a pasted list, colour swatches, and suggestions of the
 * preset values not yet used.
 */
@Component({
  selector: 'sv-variant-options',
  imports: [LucideDynamicIcon, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!disabled() && options().length < max) {
      <div class="rounded-[10px] bg-canvas p-3">
        <p class="text-[12px] font-medium text-ink-soft">{{ options().length ? 'Dodaj kolejną opcję' : 'Szybki start — kliknij gotowy zestaw:' }}</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          @for (p of presets().suggested; track p.id) {
            @if (!used(p)) {
              <button type="button" class="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[12px] text-ink transition-colors hover:border-primary hover:text-primary-strong"
                (click)="addPreset(p)"><svg [lucideIcon]="icons.plus" [size]="12" />{{ p.label }}</button>
            }
          }
          <button type="button" class="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12px] text-ink-soft hover:border-primary hover:text-primary-strong"
            (click)="addCustom()"><svg [lucideIcon]="icons.plus" [size]="12" />Własna opcja</button>
        </div>
        <details class="mt-2 text-[12px]">
          <summary class="cursor-pointer text-ink-muted hover:text-ink">Więcej gotowych zestawów</summary>
          <div class="mt-2 flex flex-wrap gap-1.5">
            @for (p of presets().other; track p.id) {
              @if (!used(p)) {
                <button type="button" class="rounded-full border border-line bg-card px-2.5 py-1 text-[12px] text-ink-soft hover:border-primary hover:text-primary-strong"
                  (click)="addPreset(p)">{{ p.label }}</button>
              }
            }
          </div>
        </details>
      </div>
    }

    <div class="mt-3 space-y-3">
      @for (o of options(); track $index; let i = $index) {
        <fieldset class="rounded-[10px] border border-line p-3" [disabled]="disabled()">
          <legend class="sr-only">Opcja {{ i + 1 }}</legend>
          <div class="flex items-center gap-2">
            <input class="sv-input !h-9 max-w-[220px] font-medium" [id]="'opt-name-' + i" maxlength="40" placeholder="Nazwa, np. Rozmiar" list="sv-option-names"
              [attr.aria-label]="'Nazwa opcji ' + (i + 1)" [value]="o.name" (input)="rename(i, $any($event.target).value)" />
            <span class="flex-1"></span>
            <button sv-button type="button" variant="ghost" size="icon" [attr.aria-label]="'Usuń opcję ' + (o.name || i + 1)" (click)="remove(i)">
              <svg [lucideIcon]="icons.trash" /></button>
          </div>
          <div class="mt-2 flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-card px-2 py-1.5
            focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)]">
            @for (v of o.values; track v; let j = $index) {
              <span class="inline-flex items-center gap-1.5 rounded-[6px] bg-canvas py-0.5 pl-2 pr-1 text-[13px] text-ink">
                @if (isColor(o.name) && swatch(v); as sw) {<span class="size-3 rounded-full border border-black/10" [style.background]="sw" aria-hidden="true"></span>}
                {{ v }}
                <button type="button" class="rounded-[4px] p-0.5 text-ink-muted hover:bg-line hover:text-ink" [attr.aria-label]="'Usuń wartość ' + v" (click)="removeValue(i, j)">
                  <svg [lucideIcon]="icons.close" [size]="12" /></button>
              </span>
            }
            <input class="h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 text-[13px] outline-none placeholder:text-ink-muted" [id]="'opt-values-' + i"
              [attr.aria-label]="'Dodaj wartość opcji ' + (o.name || i + 1)" [placeholder]="o.values.length ? 'Dodaj…' : 'Wpisz wartość i naciśnij Enter, np. S, M, L'"
              (keydown)="valueKey($event, i)" (paste)="paste($event, i)" (blur)="commit($any($event.target), i)" />
          </div>
          @if (suggestions(o); as sug) {
            @if (sug.length) {
              <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span class="text-ink-muted">Podpowiedzi:</span>
                @for (s of sug; track s) {
                  <button type="button" class="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-ink-soft hover:border-primary hover:text-primary-strong"
                    (click)="addValues(i, [s])">
                    @if (isColor(o.name) && swatch(s); as sw) {<span class="size-2.5 rounded-full border border-black/10" [style.background]="sw" aria-hidden="true"></span>}
                    {{ s }}</button>
                }
              </div>
            }
          }
        </fieldset>
      }
    </div>
    <datalist id="sv-option-names">
      @for (n of optionNames; track n) {<option [value]="n"></option>}
    </datalist>
  `,
})
export class VariantOptionsComponent {
  protected readonly icons = icons;
  protected readonly max = MAX_OPTIONS;
  readonly options = model<OptionRow[]>([]);
  /** Store industries (primary first) — their presets are suggested first. */
  readonly industry = input<StoreIndustry | StoreIndustry[] | null>(null);
  readonly disabled = input(false);
  protected readonly presets = computed(() => presetsFor(this.industry()));
  protected readonly optionNames = [...new Set(OPTION_PRESETS.map((p) => p.name))];

  protected isColor(name: string): boolean {
    return isColorOption(name);
  }

  protected swatch(value: string): string | null {
    return COLOR_SWATCHES[value] ?? Object.entries(COLOR_SWATCHES).find(([k]) => k.toLowerCase() === value.toLowerCase())?.[1] ?? null;
  }

  protected used(p: OptionPreset): boolean {
    return this.options().some((o) => o.name.trim().toLowerCase() === p.name.toLowerCase());
  }

  /** Values from presets with the same option name (and the colour palette) that are not used yet. */
  protected suggestions(o: OptionRow): string[] {
    const name = o.name.trim().toLowerCase();
    if (!name) return [];
    const pool = isColorOption(name) ? Object.keys(COLOR_SWATCHES)
      : [...new Set(this.orderedPresets().filter((p) => p.name.toLowerCase() === name).flatMap((p) => p.values))];
    const have = new Set(o.values.map((v) => v.toLowerCase()));
    return pool.filter((v) => !have.has(v.toLowerCase())).slice(0, 16);
  }

  private orderedPresets(): OptionPreset[] {
    return [...this.presets().suggested, ...this.presets().other];
  }

  protected addPreset(p: OptionPreset): void {
    if (this.options().length >= MAX_OPTIONS) return;
    this.options.set([...this.options(), { name: p.name, values: [...p.values] }]);
  }

  protected addCustom(): void {
    if (this.options().length >= MAX_OPTIONS) return;
    this.options.set([...this.options(), { name: '', values: [] }]);
    queueMicrotask(() => document.getElementById('opt-name-' + (this.options().length - 1))?.focus());
  }

  protected remove(i: number): void {
    this.options.set(this.options().filter((_, j) => j !== i));
  }

  protected rename(i: number, name: string): void {
    this.options.set(this.options().map((o, j) => (j === i ? { ...o, name } : o)));
  }

  protected addValues(i: number, values: string[]): void {
    this.options.set(this.options().map((o, j) => (j === i ? { ...o, values: mergeValues(o.values, values) } : o)));
  }

  protected removeValue(i: number, j: number): void {
    this.options.set(this.options().map((o, k) => (k === i ? { ...o, values: o.values.filter((_, m) => m !== j) } : o)));
  }

  protected valueKey(e: KeyboardEvent, i: number): void {
    const el = e.target as HTMLInputElement;
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      this.commit(el, i);
    } else if (e.key === 'Backspace' && !el.value && this.options()[i].values.length) {
      this.removeValue(i, this.options()[i].values.length - 1);
    }
  }

  protected paste(e: ClipboardEvent, i: number): void {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/[,;\n]/.test(text)) return;
    e.preventDefault();
    this.addValues(i, splitValues(text));
  }

  protected commit(el: HTMLInputElement, i: number): void {
    const values = splitValues(el.value);
    el.value = '';
    if (values.length) this.addValues(i, values);
  }
}
