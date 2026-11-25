import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SelectComponent } from './select';

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

/** Period selector built on sv-select (anchored panel on desktop, bottom sheet on mobile). */
@Component({
  selector: 'sv-date-range',
  imports: [SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-flex' },
  template: `
    <sv-select class="w-[200px]" leadingIcon="calendar" ariaLabel="Okres" [options]="selectOptions()" [value]="value()"
      (valueChange)="select($any($event))" />
  `,
})
export class DateRangeComponent {
  readonly options = input<DateRangeOption[]>(DATE_RANGES);
  readonly value = input<string>('30d');
  readonly rangeChange = output<DateRangeOption>();
  protected readonly selectOptions = computed(() => this.options().map((o) => ({ value: o.value, label: o.label })));

  protected select(value: string): void {
    const option = this.options().find((o) => o.value === value);
    if (option) this.rangeChange.emit(option);
  }
}
