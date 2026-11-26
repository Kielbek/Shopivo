import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { money } from '../core/format';

/** Price with the previous price and the Omnibus reference price (lowest in the 30 days before the reduction). */
@Component({
  selector: 'sf-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex flex-wrap items-baseline gap-x-2">
      <span class="font-semibold tabular-nums" [class.text-sf-danger]="reduced()" [class]="large() ? 'text-[26px]' : 'text-[15px]'">
        {{ from() ? 'od ' : '' }}{{ fmt(price()) }}
      </span>
      @if (reduced()) {
        <s class="text-sf-muted tabular-nums" [class]="large() ? 'text-[17px]' : 'text-[13px]'" aria-label="Cena przed obniżką">{{ fmt(compareAt()) }}</s>
      }
    </span>
    @if (reduced() && lowest30() !== null) {
      <span class="block text-sf-muted" [class]="large() ? 'mt-1 text-[13px]' : 'text-[11px]'">Najniższa cena z 30 dni przed obniżką: {{ fmt(lowest30()) }}</span>
    }
  `,
})
export class PriceComponent {
  readonly price = input.required<number>();
  readonly compareAt = input<number | null>(null);
  readonly lowest30 = input<number | null>(null);
  readonly currency = input('PLN');
  readonly from = input(false);
  readonly large = input(false);
  protected readonly reduced = computed(() => (this.compareAt() ?? 0) > this.price());
  protected fmt(v: number | null): string {
    return money(v, this.currency());
  }
}
