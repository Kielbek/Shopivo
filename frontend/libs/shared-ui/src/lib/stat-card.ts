import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { IconName, icons } from './icons';

export type StatTone = 'coral' | 'violet' | 'orange' | 'blue' | 'green';

const TONES: Record<StatTone, string> = {
  coral: '#F47C87',
  violet: '#A58AF7',
  orange: '#FFB86B',
  blue: '#3D7BEA',
  green: '#4C9A1B',
};

/**
 * Compact KPI card: label with a quiet icon tile, large value and optional change vs. previous period.
 * (`tone` is kept for callers; the card itself stays monochrome so numbers, not decoration, carry the meaning.)
 * `value === null` renders an explicit "no data" state instead of a made-up number.
 */
@Component({
  selector: 'sv-stat-card',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sv-card flex flex-col gap-2 p-4 sm:px-5 sm:py-4' },
  template: `
    <div class="flex items-center justify-between gap-3">
      <p class="truncate text-[13px] font-medium text-ink-soft">{{ label() }}</p>
      <span class="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-canvas text-ink-soft">
        <svg [lucideIcon]="ICONS[icon()]" [size]="16" [strokeWidth]="1.75" />
      </span>
    </div>
    <div class="min-w-0">
      @if (loading()) {
        <span class="sv-shimmer mt-1.5 block h-5 w-20 rounded-[5px]" aria-hidden="true"></span><span class="sr-only">Wczytywanie…</span>
      } @else if (value() !== null) {
        <p class="mt-0.5 truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink tabular-nums">{{ value() }}</p>
      } @else {
        <p class="mt-0.5 text-[24px] font-semibold leading-tight text-[#C2C6BF]" aria-label="Brak danych">—</p>
      }
      @if (loading()) {
        <span class="sv-shimmer mt-2 block h-3 w-28 rounded-[4px]" aria-hidden="true"></span>
      } @else if (change() !== null && change() !== undefined) {
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
  /** Shows a shimmering placeholder instead of the value. */
  readonly loading = input(false);
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
