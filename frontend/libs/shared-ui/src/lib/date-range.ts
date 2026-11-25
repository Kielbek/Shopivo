import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from './icons';

export interface DateRangeOption {
  value: string;
  label: string;
  days: number;
}

export const DATE_RANGES: DateRangeOption[] = [
  { value: '7d', label: 'Ostatnie 7 dni', days: 7 },
  { value: '30d', label: 'Ostatnie 30 dni', days: 30 },
  { value: '90d', label: 'Ostatnie 90 dni', days: 90 },
  { value: '365d', label: 'Ostatnie 12 miesięcy', days: 365 },
];

/** Compact period selector: calendar icon over a native select (keyboard and screen-reader friendly). */
@Component({
  selector: 'sv-date-range',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-flex' },
  template: `
    <label class="sr-only" [attr.for]="id">Okres</label>
    <svg [lucideIcon]="calendar" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    <select [id]="id" class="sv-input h-9 w-auto pl-9 text-[13px]" (change)="select($any($event.target).value)">
      <!-- [selected] per option: a [value] binding on <select> runs before the options exist and is lost. -->
      @for (o of options(); track o.value) {<option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>}
    </select>
  `,
})
export class DateRangeComponent {
  private static counter = 0;
  protected readonly id = `sv-range-${++DateRangeComponent.counter}`;
  protected readonly calendar = icons.calendar;
  readonly options = input<DateRangeOption[]>(DATE_RANGES);
  readonly value = input<string>('30d');
  readonly rangeChange = output<DateRangeOption>();

  protected select(value: string): void {
    const option = this.options().find((o) => o.value === value);
    if (option) this.rangeChange.emit(option);
  }
}
