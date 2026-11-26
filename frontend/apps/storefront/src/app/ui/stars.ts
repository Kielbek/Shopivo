import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Read-only star rating (0–5, halves rounded). */
@Component({
  selector: 'sf-stars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center', role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    @for (i of [1, 2, 3, 4, 5]; track i) {
      <svg viewBox="0 0 20 20" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
        <defs><linearGradient [attr.id]="'g' + uid + i"><stop [attr.offset]="fill(i)" stop-color="#F5A524" /><stop [attr.offset]="fill(i)" stop-color="#D9DCE3" /></linearGradient></defs>
        <path [attr.fill]="'url(#g' + uid + i + ')'" d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" />
      </svg>
    }
  `,
})
export class StarsComponent {
  private static next = 0;
  protected readonly uid = StarsComponent.next++;
  readonly value = input.required<number>();
  readonly size = input(16);
  protected readonly label = computed(() => `Ocena ${this.value().toLocaleString('pl-PL', { maximumFractionDigits: 1 })} na 5`);

  protected fill(i: number): string {
    const v = Math.round(this.value() * 2) / 2;
    return v >= i ? '100%' : v >= i - 0.5 ? '50%' : '0%';
  }
}
