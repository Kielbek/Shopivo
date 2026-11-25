import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<AlertTone, string> = {
  info: 'border-zinc-200 bg-zinc-50 text-zinc-800',
  success: 'border-brand-200 bg-brand-50 text-brand-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

@Component({
  selector: 'sv-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.role]': 'tone() === "error" ? "alert" : "status"',
  },
  template: `
    @if (heading()) {<p class="font-medium">{{ heading() }}</p>}
    <div class="text-[13px] leading-5" [class.mt-0.5]="!!heading()"><ng-content /></div>
  `,
})
export class AlertComponent {
  readonly tone = input<AlertTone>('info');
  readonly heading = input<string>();
  protected readonly classes = computed(() => `block rounded-[var(--radius-ui)] border px-4 py-3 ${TONES[this.tone()]}`);
}
