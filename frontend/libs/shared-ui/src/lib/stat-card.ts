import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { IconName, icons } from './icons';

export type StatTone = 'coral' | 'violet' | 'orange' | 'blue' | 'green';

const TONES: Record<StatTone, string> = {
  coral: '#F47C87',
  violet: '#A58AF7',
  orange: '#FFB86B',
  blue: '#5B8DEF',
  green: '#36CFA5',
};

/**
 * Compact KPI card: solid coloured icon circle, label, value and optional change vs. previous period.
 * `value === null` renders an explicit "no data" state instead of a made-up number.
 */
@Component({
  selector: 'sv-stat-card',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sv-card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-[18px]' },
  template: `
    <span class="flex size-10 shrink-0 sm:size-12 items-center justify-center rounded-full text-white" [style.background]="color()">
      <svg [lucideIcon]="ICONS[icon()]" [size]="20" [strokeWidth]="2" />
    </span>
    <div class="min-w-0">
      <p class="truncate text-[13px] text-ink-muted">{{ label() }}</p>
      @if (value() !== null) {
        <p class="mt-0.5 truncate text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink tabular-nums">{{ value() }}</p>
      } @else {
        <p class="mt-0.5 text-[20px] font-semibold leading-tight text-[#C5CBD6]" aria-label="Brak danych">—</p>
      }
      @if (change() !== null && change() !== undefined) {
        <p class="mt-1 flex items-center gap-1 text-[12px]">
          <span class="inline-flex items-center font-medium" [class.text-success-ink]="change()! >= 0" [class.text-danger-ink]="change()! < 0">
            <svg [lucideIcon]="change()! >= 0 ? ICONS.arrowUp : ICONS.arrowDown" [size]="14" />
            {{ formattedChange() }}
          </span>
          @if (comparison()) {<span class="text-ink-muted">{{ comparison() }}</span>}
        </p>
      } @else if (caption()) {
        <p class="mt-1 truncate text-[12px] text-ink-muted">{{ caption() }}</p>
      }
    </div>
  `,
})
export class StatCardComponent {
  protected readonly ICONS = icons;
  readonly label = input.required<string>();
  readonly value = input.required<string | null>();
  readonly icon = input.required<IconName>();
  readonly tone = input<StatTone>('blue');
  /** Percentage change vs. previous period, e.g. 12.5 or -3. */
  readonly change = input<number | null>();
  readonly comparison = input<string>();
  readonly caption = input<string>();

  protected readonly color = computed(() => TONES[this.tone()]);
  protected readonly formattedChange = computed(() => {
    const c = this.change() ?? 0;
    return `${c >= 0 ? '+' : ''}${c.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`;
  });
}
