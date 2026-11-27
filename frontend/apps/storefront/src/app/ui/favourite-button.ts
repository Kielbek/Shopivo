import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Wishlist } from '../core/wishlist';

/** Heart toggle for a product (favourites). */
@Component({
  selector: 'sf-favourite-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [class]="'flex items-center justify-center rounded-full transition-colors ' + (big() ? 'size-12 border border-sf-line bg-sf-bg hover:border-sf-text' : 'size-9 bg-sf-bg/90 shadow-sm backdrop-blur hover:bg-sf-bg')"
      [attr.aria-pressed]="active()" [attr.aria-label]="(active() ? 'Usuń z ulubionych: ' : 'Dodaj do ulubionych: ') + name()"
      [attr.title]="active() ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'" (click)="$event.preventDefault(); $event.stopPropagation(); toggle()">
      <svg viewBox="0 0 24 24" [class]="big() ? 'size-6' : 'size-[18px]'" [attr.fill]="active() ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8"
        [class.text-sf-danger]="active()" aria-hidden="true">
        <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20Z" stroke-linejoin="round"/>
      </svg>
    </button>
  `,
})
export class FavouriteButtonComponent {
  private readonly wishlist = inject(Wishlist);
  readonly productId = input.required<string>();
  readonly name = input('');
  readonly big = input(false);
  protected readonly active = computed(() => this.wishlist.ids().includes(this.productId()));

  protected toggle(): void {
    void this.wishlist.toggle(this.productId());
  }
}
