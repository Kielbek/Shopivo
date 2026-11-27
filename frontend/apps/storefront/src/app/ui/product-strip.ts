import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { StorefrontApi } from '../storefront-api';
import { ProductCardComponent } from './product-card';

/** A titled row of product cards for a list of ids (recently viewed etc.). Renders nothing when empty. */
@Component({
  selector: 'sf-product-strip',
  imports: [ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cards().length) {
      <section class="mt-14 border-t border-sf-line pt-8" [attr.aria-label]="heading()">
        <h2 class="text-[22px] font-semibold tracking-tight">{{ heading() }}</h2>
        <ul class="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
          @for (p of cards(); track p.id) {<li><sf-product-card [product]="p" /></li>}
        </ul>
      </section>
    }
  `,
})
export class ProductStripComponent {
  private readonly api = inject(StorefrontApi);
  readonly heading = input.required<string>();
  readonly ids = input.required<string[]>();
  readonly limit = input(4);
  private readonly wanted = computed(() => this.ids().slice(0, this.limit()));
  private readonly data = rxResource({
    params: () => this.wanted().join(','),
    stream: ({ params }) => (params ? this.api.productCards(params.split(',')) : of([])),
  });
  protected readonly cards = computed(() => (this.data.hasValue() ? this.data.value() : []));
}
