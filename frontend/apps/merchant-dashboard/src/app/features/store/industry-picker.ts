import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { StoreIndustry } from '@shopivo/shared-models';
import { icons } from '@shopivo/shared-ui';
import { INDUSTRIES } from '../catalog/industries';

/** Grid of store industries (radio group) with a search box. Keyboard: Tab into the group, arrows move, Space selects. */
@Component({
  selector: 'sv-industry-picker',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input type="search" class="sv-input !bg-card pl-9" placeholder="Szukaj branży, np. buty, kosmetyki…" aria-label="Szukaj branży"
        [value]="query()" (input)="query.set($any($event.target).value)" />
    </div>
    <div role="radiogroup" [attr.aria-label]="label()" class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" [class.lg:grid-cols-4]="wide()">
      @for (i of filtered(); track i.id) {
        <button type="button" role="radio" [attr.aria-checked]="value() === i.id" [tabIndex]="tabIndexOf(i.id)"
          class="group flex min-w-0 items-start gap-2.5 rounded-[10px] border p-3 text-left transition-[border-color,background-color,box-shadow]
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          [class]="value() === i.id ? 'border-primary bg-primary-soft shadow-[0_0_0_1px_var(--color-primary)]' : 'border-line bg-card hover:border-line-strong hover:bg-hover'"
          (click)="value.set(value() === i.id && clearable() ? null : i.id)" (keydown)="key($event, i.id)">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px]"
            [class]="value() === i.id ? 'bg-night text-neon' : 'bg-canvas text-ink-soft group-hover:text-ink'">
            <svg [lucideIcon]="icons[i.icon]" [size]="16" />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[13px] font-medium text-ink">{{ i.label }}</span>
            <span class="line-clamp-2 text-[11px] leading-4 text-ink-muted">{{ i.hint }}</span>
          </span>
        </button>
      } @empty {
        <p class="col-span-full py-4 text-center text-[13px] text-ink-muted">Nic nie znaleziono — wybierz „Wielobranżowy”.</p>
      }
    </div>
  `,
})
export class IndustryPickerComponent {
  protected readonly icons = icons;
  readonly value = model<StoreIndustry | null>(null);
  readonly label = input('Branża sklepu');
  readonly wide = input(false);
  /** Clicking the selected industry again clears the choice. */
  readonly clearable = input(true);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = normalize(this.query());
    if (!q) return INDUSTRIES;
    return INDUSTRIES.filter((i) => normalize(i.label + ' ' + i.hint).includes(q));
  });

  /** Roving tab index: the selected item (or the first one) is the single tab stop. */
  protected tabIndexOf(id: StoreIndustry): number {
    const list = this.filtered();
    const current = list.some((i) => i.id === this.value()) ? this.value() : list[0]?.id;
    return id === current ? 0 : -1;
  }

  protected key(event: KeyboardEvent, id: StoreIndustry): void {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const list = this.filtered();
    const next = list[(list.findIndex((i) => i.id === id) + delta + list.length) % list.length];
    this.value.set(next.id);
    const group = (event.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
}
